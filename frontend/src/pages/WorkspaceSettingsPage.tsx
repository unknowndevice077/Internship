import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { api, fieldErrors } from "../api/client";
import { keys, useMembers } from "../api/queries";
import type { Role } from "../api/types";
import { useAuth, useCan } from "../auth/AuthContext";

export default function WorkspaceSettingsPage() {
  const { workspace } = useAuth();
  const isAdmin = useCan("admin");

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted small">{workspace?.name}</p>
          <h1>Workspace settings</h1>
        </div>
      </header>
      <Members />
      {isAdmin && <Webhooks />}
    </div>
  );
}

function Members() {
  const qc = useQueryClient();
  const { me, workspace } = useAuth();
  const isAdmin = useCan("admin");
  const isOwner = workspace?.role === "owner";
  const { data: members = [] } = useMembers();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [error, setError] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: keys.members });
  const invite = useMutation({
    mutationFn: () => api("/members/", { method: "POST", body: { email, role } }),
    onSuccess: () => {
      setEmail("");
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, role }: { id: number; role: Role }) => api(`/members/${id}/`, { method: "PATCH", body: { role } }),
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/members/${id}/`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    invite.mutate();
  }

  const roles: Role[] = isOwner ? ["owner", "admin", "member", "viewer"] : ["admin", "member", "viewer"];

  return (
    <section className="card settings-section">
      <h2>Members</h2>
      {error && <p className="form-error">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>{m.user.full_name || <span className="muted">Invited</span>}</td>
              <td>{m.user.email}</td>
              <td>
                {isAdmin && m.user.id !== me?.id && (isOwner || m.role !== "owner") ? (
                  <select value={m.role} onChange={(e) => update.mutate({ id: m.id, role: e.target.value as Role })}>
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  m.role
                )}
              </td>
              <td className="actions">
                {isAdmin && m.user.id !== me?.id && (isOwner || m.role !== "owner") && (
                  <button className="btn btn-ghost btn-danger" onClick={() => remove.mutate(m.id)}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {isAdmin && (
        <form className="inline-form compact" onSubmit={submit}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" required />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
          <button className="btn btn-primary" disabled={invite.isPending}>
            Invite
          </button>
          {fieldErrors(invite.error).email && <span className="field-error">{fieldErrors(invite.error).email}</span>}
        </form>
      )}
    </section>
  );
}

interface Webhook {
  id: number;
  url: string;
  description: string;
  events: string[];
  is_active: boolean;
  secret: string;
  stats: { recent: number; failed: number };
}

interface Delivery {
  id: number;
  event: string;
  state: "pending" | "success" | "failed";
  attempts: number;
  response_code: number | null;
  last_error: string;
  duration_ms: number | null;
  created_at: string;
}

function Webhooks() {
  const qc = useQueryClient();
  const { data: hooks = [] } = useQuery({ queryKey: ["webhooks"], queryFn: () => api<Webhook[]>("/webhooks/") });
  const { data: events = [] } = useQuery({ queryKey: ["webhook-events"], queryFn: () => api<string[]>("/webhooks/events/") });
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [newSecret, setNewSecret] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["webhooks"] });
  const create = useMutation({
    mutationFn: () => api<Webhook>("/webhooks/", { method: "POST", body: { url, events: picked } }),
    onSuccess: (hook) => {
      setNewSecret(hook.secret);
      setUrl("");
      setPicked([]);
      refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: (h: Webhook) => api(`/webhooks/${h.id}/`, { method: "PATCH", body: { is_active: !h.is_active } }),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: number) => api(`/webhooks/${id}/`, { method: "DELETE" }), onSuccess: refresh });
  const ping = useMutation({
    mutationFn: (id: number) => api(`/webhooks/${id}/ping/`, { method: "POST" }),
    onSuccess: (_, id) => setTimeout(() => qc.invalidateQueries({ queryKey: ["deliveries", id] }), 1500),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <section className="card settings-section">
      <h2>Webhooks</h2>
      <p className="muted small">
        We POST a JSON payload for each event, signed with <code>X-Sprintboard-Signature: sha256=HMAC(secret, body)</code>. Failed
        deliveries are retried up to 5 times with backoff.
      </p>

      {newSecret && (
        <div className="notice">
          Signing secret (shown once): <code>{newSecret}</code>
          <button className="btn btn-ghost small" onClick={() => setNewSecret("")}>
            Dismiss
          </button>
        </div>
      )}

      {hooks.map((h) => (
        <div key={h.id} className="webhook">
          <div className="webhook-row">
            <span className={`dot ${h.is_active ? "dot-on" : ""}`} />
            <code className="grow">{h.url}</code>
            <span className="muted small">{h.events.length ? `${h.events.length} events` : "all events"}</span>
            {h.stats.failed > 0 && <span className="badge badge-failed">{h.stats.failed} failed</span>}
            <button className="btn btn-ghost small" onClick={() => ping.mutate(h.id)}>
              Send ping
            </button>
            <button className="btn btn-ghost small" onClick={() => setOpenId(openId === h.id ? null : h.id)}>
              Deliveries
            </button>
            <button className="btn btn-ghost small" onClick={() => toggle.mutate(h)}>
              {h.is_active ? "Disable" : "Enable"}
            </button>
            <button className="btn btn-ghost small btn-danger" onClick={() => remove.mutate(h.id)}>
              Delete
            </button>
          </div>
          {openId === h.id && <Deliveries hookId={h.id} />}
        </div>
      ))}

      <form className="webhook-form" onSubmit={submit}>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/sprintboard" required />
        <div className="event-picker">
          {events.map((ev) => (
            <label key={ev} className="checkbox">
              <input
                type="checkbox"
                checked={picked.includes(ev)}
                onChange={() => setPicked(picked.includes(ev) ? picked.filter((p) => p !== ev) : [...picked, ev])}
              />
              {ev}
            </label>
          ))}
        </div>
        <p className="muted small">Leave every box empty to receive all events.</p>
        {fieldErrors(create.error).url && <span className="field-error">{fieldErrors(create.error).url}</span>}
        <button className="btn btn-primary" disabled={create.isPending}>
          Add endpoint
        </button>
      </form>
    </section>
  );
}

function Deliveries({ hookId }: { hookId: number }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["deliveries", hookId],
    queryFn: () => api<Delivery[]>(`/webhooks/${hookId}/deliveries/`),
    refetchInterval: 5000,
  });
  const redeliver = useMutation({
    mutationFn: (id: number) => api(`/webhooks/${hookId}/deliveries/${id}/redeliver/`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries", hookId] }),
  });

  if (data.length === 0) return <p className="muted small pad">No deliveries yet.</p>;
  return (
    <table className="table deliveries">
      <tbody>
        {data.map((d) => (
          <tr key={d.id}>
            <td>
              <span className={`badge badge-${d.state}`}>{d.state}</span>
            </td>
            <td>{d.event}</td>
            <td className="muted small">{d.response_code ?? d.last_error ?? "–"}</td>
            <td className="muted small">{d.attempts} attempt{d.attempts === 1 ? "" : "s"}</td>
            <td className="muted small">{d.duration_ms != null ? `${d.duration_ms} ms` : ""}</td>
            <td className="muted small">{new Date(d.created_at).toLocaleString()}</td>
            <td className="actions">
              {d.state === "failed" && (
                <button className="btn btn-ghost small" onClick={() => redeliver.mutate(d.id)}>
                  Redeliver
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
