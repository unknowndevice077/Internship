import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import { api, ApiError } from "../api/client";
import { useBoard } from "../api/queries";
import type { Status, StatusCategory, Transition } from "../api/types";
import { useCan } from "../auth/useAuth";

const CATEGORIES: { value: StatusCategory; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

export default function ProjectSettingsPage() {
  const projectId = Number(useParams().projectId);
  const isAdmin = useCan("admin");
  const qc = useQueryClient();
  const { data: board } = useBoard(projectId);
  const { data: statuses = [] } = useQuery({
    queryKey: ["statuses", projectId],
    queryFn: () => api<Status[]>(`/statuses/?project=${projectId}`),
  });
  const { data: transitions = [] } = useQuery({
    queryKey: ["transitions", projectId],
    queryFn: () => api<Transition[]>(`/transitions/?project=${projectId}`),
  });
  const [error, setError] = useState("");

  const refresh = () => {
    setError("");
    return Promise.all([
      qc.invalidateQueries({ queryKey: ["statuses", projectId] }),
      qc.invalidateQueries({ queryKey: ["transitions", projectId] }),
      qc.invalidateQueries({ queryKey: ["board", projectId] }),
    ]);
  };
  const onError = (err: Error) => setError(err instanceof ApiError ? err.message : "Something went wrong.");

  const saveStatus = useMutation({
    mutationFn: ({ id, ...patch }: Partial<Status> & { id: number }) =>
      api(`/statuses/${id}/`, { method: "PATCH", body: patch }),
    onSuccess: refresh,
    onError,
  });
  const deleteStatus = useMutation({
    mutationFn: (id: number) => api(`/statuses/${id}/`, { method: "DELETE" }),
    onSuccess: refresh,
    onError,
  });
  type Toggle = { from: number; to: number; existing?: Transition };
  // the clicked cell's new value, shown until the refetch confirms it
  const [pendingCell, setPendingCell] = useState<{ from: number; to: number; checked: boolean } | null>(null);
  const toggle = useMutation({
    mutationFn: ({ from, to, existing }: Toggle) =>
      existing
        ? api(`/transitions/${existing.id}/`, { method: "DELETE" })
        : api("/transitions/", { method: "POST", body: { project: projectId, from_status: from, to_status: to } }),
    onSettled: () => refresh().finally(() => setPendingCell(null)),
    onError,
  });

  function toggleCell(from: number, to: number) {
    const existing = transitions.find((t) => t.from_status === from && t.to_status === to);
    setPendingCell({ from, to, checked: !existing });
    toggle.mutate({ from, to, existing });
  }

  function swap(index: number, dir: -1 | 1) {
    const a = statuses[index];
    const b = statuses[index + dir];
    if (!a || !b) return;
    Promise.all([
      api(`/statuses/${a.id}/`, { method: "PATCH", body: { order: b.order === a.order ? a.order + dir : b.order } }),
      api(`/statuses/${b.id}/`, { method: "PATCH", body: { order: a.order } }),
    ]).then(refresh, onError);
  }

  if (!isAdmin) return <div className="page">Only workspace admins can change the workflow.</div>;

  const has = (from: number, to: number) =>
    pendingCell?.from === from && pendingCell.to === to
      ? pendingCell.checked
      : transitions.some((t) => t.from_status === from && t.to_status === to);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted small">{board?.project.name}</p>
          <h1>Workflow</h1>
        </div>
      </header>
      {error && <p className="form-error">{error}</p>}

      <section className="card settings-section">
        <h2>Statuses</h2>
        <p className="muted small">Each status is a column on the board.</p>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {statuses.map((s, i) => (
              <tr key={s.id}>
                <td>
                  <input
                    defaultValue={s.name}
                    onBlur={(e) => e.target.value !== s.name && saveStatus.mutate({ id: s.id, name: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    value={s.category}
                    onChange={(e) => saveStatus.mutate({ id: s.id, category: e.target.value as StatusCategory })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="actions">
                  <button
                    className="btn btn-ghost icon-btn"
                    disabled={i === 0}
                    onClick={() => swap(i, -1)}
                    aria-label="Move up"
                  >
                    <Chevron up />
                  </button>
                  <button
                    className="btn btn-ghost icon-btn"
                    disabled={i === statuses.length - 1}
                    onClick={() => swap(i, 1)}
                    aria-label="Move down"
                  >
                    <Chevron />
                  </button>
                  <button className="btn btn-ghost btn-danger" onClick={() => deleteStatus.mutate(s.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <NewStatus projectId={projectId} nextOrder={statuses.length} onDone={refresh} />
      </section>

      <section className="card settings-section">
        <h2>Transitions</h2>
        <p className="muted small">
          {transitions.length === 0
            ? "No rules yet, so issues can move between any statuses. Tick a box to start restricting moves."
            : "Issues can only move along the ticked transitions (row → column)."}
        </p>
        <div className="matrix-wrap">
          <table className="table matrix">
            <thead>
              <tr>
                <th>From \ To</th>
                {statuses.map((s) => (
                  <th key={s.id}>{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statuses.map((from) => (
                <tr key={from.id}>
                  <th>{from.name}</th>
                  {statuses.map((to) => (
                    <td key={to.id}>
                      {from.id === to.id ? (
                        <span className="muted">–</span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={has(from.id, to.id)}
                          disabled={pendingCell !== null}
                          onChange={() => toggleCell(from.id, to.id)}
                          aria-label={`${from.name} to ${to.name}`}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function NewStatus({ projectId, nextOrder, onDone }: { projectId: number; nextOrder: number; onDone(): void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StatusCategory>("in_progress");
  const create = useMutation({
    mutationFn: () =>
      api("/statuses/", { method: "POST", body: { project: projectId, name, category, order: nextOrder } }),
    onSuccess: () => {
      setName("");
      onDone();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <form className="inline-form compact" onSubmit={submit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New status name" required />
      <select value={category} onChange={(e) => setCategory(e.target.value as StatusCategory)}>
        {CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <button className="btn" disabled={create.isPending}>
        Add status
      </button>
      {create.error && <span className="field-error">{create.error.message}</span>}
    </form>
  );
}

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}
