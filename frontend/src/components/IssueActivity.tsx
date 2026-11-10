import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";

import { api, downloadFile, fieldErrors } from "../api/client";
import type { Attachment, AuditEntry, Comment, Page, Status } from "../api/types";
import { useAuth, useCan } from "../auth/useAuth";
import { timeAgo } from "../time";

const who = (u: { full_name: string; email: string } | null) => (u ? u.full_name || u.email : "Someone");

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Attachments({ issueId }: { issueId: number }) {
  const qc = useQueryClient();
  const { me } = useAuth();
  const canEdit = useCan("member");
  const isAdmin = useCan("admin");
  const input = useRef<HTMLInputElement>(null);
  const key = ["attachments", issueId];
  const { data: files = [] } = useQuery({
    queryKey: key,
    queryFn: () => api<Attachment[]>(`/attachments/?issue=${issueId}`),
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("issue", String(issueId));
      form.append("file", file);
      return api<Attachment>("/attachments/", { method: "POST", body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/attachments/${id}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const error = fieldErrors(upload.error).file;

  return (
    <section className="drawer-section">
      <div className="section-title">
        <span>Attachments</span>
        {canEdit && (
          <>
            <button className="btn btn-ghost small" onClick={() => input.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? "Uploading…" : "+ Add"}
            </button>
            <input
              ref={input}
              type="file"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>
      {error && <p className="form-error small">{error}</p>}
      {files.length === 0 ? (
        <p className="muted small">No files.</p>
      ) : (
        <ul className="attachment-list">
          {files.map((f) => (
            <li key={f.id}>
              <button className="link" onClick={() => downloadFile(f.download_url, f.name)}>
                {f.name}
              </button>
              <span className="muted small">
                {formatSize(f.size)} · {who(f.uploaded_by)}
              </span>
              {(isAdmin || f.uploaded_by?.id === me?.id) && (
                <button className="btn btn-ghost small btn-danger" onClick={() => remove.mutate(f.id)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CommentsAndHistory({ issueId, statuses }: { issueId: number; statuses: Status[] }) {
  const [tab, setTab] = useState<"comments" | "history">("comments");
  return (
    <section className="drawer-section">
      <div className="tabs">
        <button className={tab === "comments" ? "active" : ""} onClick={() => setTab("comments")}>
          Comments
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          History
        </button>
      </div>
      {tab === "comments" ? <Comments issueId={issueId} /> : <History issueId={issueId} statuses={statuses} />}
    </section>
  );
}

function Comments({ issueId }: { issueId: number }) {
  const qc = useQueryClient();
  const { me } = useAuth();
  const canEdit = useCan("member");
  const isAdmin = useCan("admin");
  const [body, setBody] = useState("");
  const key = ["comments", issueId];
  const { data: comments = [] } = useQuery({
    queryKey: key,
    queryFn: () => api<Comment[]>(`/comments/?issue=${issueId}`),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["history", issueId] });
  };
  const add = useMutation({
    mutationFn: () => api<Comment>("/comments/", { method: "POST", body: { issue: issueId, body } }),
    onSuccess: () => {
      setBody("");
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/comments/${id}/`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (body.trim()) add.mutate();
  }

  return (
    <div className="comments">
      {canEdit && (
        <form onSubmit={submit} className="comment-form">
          <textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment… mention someone with @their@email.com"
          />
          <button className="btn btn-primary" disabled={add.isPending || !body.trim()}>
            Save
          </button>
        </form>
      )}
      {comments.length === 0 && <p className="muted small">No comments yet.</p>}
      {comments
        .slice()
        .reverse()
        .map((c) => (
          <div key={c.id} className="comment">
            <div className="avatar avatar-sm">{who(c.author)[0].toUpperCase()}</div>
            <div className="grow">
              <div className="small">
                <strong>{who(c.author)}</strong> <span className="muted">{timeAgo(c.created_at)}</span>
              </div>
              <div className="comment-body">{c.body}</div>
            </div>
            {(isAdmin || c.author?.id === me?.id) && (
              <button className="btn btn-ghost small" onClick={() => remove.mutate(c.id)} aria-label="Delete comment">
                ✕
              </button>
            )}
          </div>
        ))}
    </div>
  );
}

function describe(entry: AuditEntry, statusName: (v: unknown) => string) {
  switch (entry.action) {
    case "created":
      return entry.entity_type === "issue" ? "created the issue" : `added ${entry.entity_type} ${entry.entity_label}`;
    case "moved":
      return `moved it from ${entry.changes.status?.[0]} to ${entry.changes.status?.[1]}`;
    case "commented":
      return "commented";
    case "attached":
      return `attached ${entry.entity_label}`;
    case "deleted":
      return `deleted ${entry.entity_type} ${entry.entity_label}`;
    case "updated": {
      const parts = Object.entries(entry.changes).map(([field, [from, to]]) => {
        const fmt = field === "status" ? statusName : (v: unknown) => (v === null || v === "" ? "none" : String(v));
        return field === "description"
          ? "updated the description"
          : `changed ${field.replace("_", " ")} from ${fmt(from)} to ${fmt(to)}`;
      });
      return parts.join(", ");
    }
  }
}

function History({ issueId, statuses }: { issueId: number; statuses: Status[] }) {
  const { data } = useQuery({
    queryKey: ["history", issueId],
    queryFn: () => api<Page<AuditEntry>>(`/audit-log/?issue=${issueId}&limit=100`),
  });
  const statusName = (v: unknown) => statuses.find((s) => s.id === v)?.name ?? String(v);

  if (!data) return <p className="muted small">Loading…</p>;
  return (
    <ul className="history">
      {data.results.map((entry) => (
        <li key={entry.id}>
          <strong>{who(entry.actor)}</strong> {describe(entry, statusName)}
          <span className="muted small"> · {timeAgo(entry.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}
