import { useEffect, useState } from "react";

import { fieldErrors } from "../api/client";
import { useIssue, useMembers, useSprints, useUpdateIssue } from "../api/queries";
import type { Issue, Status } from "../api/types";
import { useCan } from "../auth/AuthContext";

interface Props {
  issueId: number;
  statuses: Status[];
  onClose(): void;
}

export default function IssueDrawer({ issueId, statuses, onClose }: Props) {
  const { data: issue } = useIssue(issueId);
  const { data: members = [] } = useMembers();
  const { data: sprints = [] } = useSprints(issue?.project ?? 0);
  const update = useUpdateIssue();
  const canEdit = useCan("member");
  const [draft, setDraft] = useState<Partial<Issue>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => setDraft({}), [issueId]);

  if (!issue) {
    return (
      <Shell onClose={onClose}>
        <p className="muted">Loading…</p>
      </Shell>
    );
  }

  const value = <K extends keyof Issue>(k: K) => (k in draft ? draft[k] : issue[k]) as Issue[K];
  const save = (patch: Partial<Issue>) => update.mutate({ id: issue.id, ...patch });
  const errors = fieldErrors(update.error);
  const openSprints = sprints.filter((s) => s.state !== "closed");

  return (
    <Shell onClose={onClose}>
      <div className="drawer-key">{issue.key}</div>
      <input
        className="drawer-title"
        value={value("title")}
        disabled={!canEdit}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        onBlur={() => draft.title !== undefined && draft.title !== issue.title && save({ title: draft.title })}
      />
      {errors.title && <span className="field-error">{errors.title}</span>}

      <div className="drawer-grid">
        <label>
          Status
          <select value={issue.status} disabled={!canEdit} onChange={(e) => save({ status: Number(e.target.value) })}>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assignee
          <select
            value={issue.assignee ?? ""}
            disabled={!canEdit}
            onChange={(e) => save({ assignee: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.full_name || m.user.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select value={issue.type} disabled={!canEdit} onChange={(e) => save({ type: e.target.value as Issue["type"] })}>
            {["task", "bug", "story", "epic"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select
            value={issue.priority}
            disabled={!canEdit}
            onChange={(e) => save({ priority: e.target.value as Issue["priority"] })}
          >
            {["highest", "high", "medium", "low", "lowest"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sprint
          <select
            value={issue.sprint ?? ""}
            disabled={!canEdit}
            onChange={(e) => save({ sprint: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Backlog</option>
            {openSprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Story points
          <input
            type="number"
            min={0}
            value={value("story_points") ?? ""}
            disabled={!canEdit}
            onChange={(e) => setDraft({ ...draft, story_points: e.target.value === "" ? null : Number(e.target.value) })}
            onBlur={() => "story_points" in draft && save({ story_points: draft.story_points })}
          />
        </label>
      </div>

      <label>
        Description
        <textarea
          rows={6}
          value={value("description")}
          disabled={!canEdit}
          placeholder="Add a description…"
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          onBlur={() => draft.description !== undefined && save({ description: draft.description })}
        />
      </label>

      <p className="muted small">
        Reported by {issue.reporter?.full_name || issue.reporter?.email || "unknown"} ·{" "}
        {new Date(issue.created_at).toLocaleDateString()}
      </p>
      {errors.status && <p className="form-error">{errors.status}</p>}
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose(): void }) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Issue details">
        <button className="drawer-close btn btn-ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
        {children}
      </aside>
    </div>
  );
}
