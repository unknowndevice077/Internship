import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { api, ApiError, fieldErrors } from "../api/client";
import { keys, useProjects } from "../api/queries";
import type { Project } from "../api/types";
import { useAuth, useCan } from "../auth/useAuth";
import { GridSkeleton } from "../components/Skeleton";

export default function ProjectsPage() {
  const { workspace } = useAuth();
  const { data: projects, isLoading } = useProjects();
  const canCreate = useCan("admin");
  const [creating, setCreating] = useState(false);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="muted">{workspace?.name}</p>
        </div>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            New project
          </button>
        )}
      </header>

      {creating && <NewProjectForm onDone={() => setCreating(false)} />}

      {isLoading ? (
        <GridSkeleton />
      ) : projects?.length ? (
        <div className="project-grid">
          {projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}/board`} className="project-card">
              <span className="project-key">{p.key}</span>
              <h3>{p.name}</h3>
              <p className="muted">{p.description || "No description"}</p>
              <span className="muted small">{p.issue_count ?? 0} issues</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">
          <p>No projects yet.</p>
          {!canCreate && <p className="muted">Ask an admin to create one.</p>}
        </div>
      )}
    </div>
  );
}

function NewProjectForm({ onDone }: { onDone(): void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: () => api<Project>("/projects/", { method: "POST", body: { name, key, description } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.projects });
      onDone();
    },
  });
  const errors = fieldErrors(create.error);

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <form className="card inline-form" onSubmit={submit}>
      <label>
        Name
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!key)
              setKey(
                e.target.value
                  .replace(/[^a-z]/gi, "")
                  .slice(0, 4)
                  .toUpperCase(),
              );
          }}
          required
          autoFocus
        />
      </label>
      <label className="narrow">
        Key
        <input value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} maxLength={10} required />
        {errors.key && <span className="field-error">{errors.key}</span>}
      </label>
      <label className="grow">
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {errors.detail && (
        <p className="form-error">
          {errors.detail}
          {create.error instanceof ApiError && create.error.isPlanLimit && (
            <>
              {" "}
              <Link to="/billing">See plans</Link>
            </>
          )}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={create.isPending}>
          Create
        </button>
      </div>
    </form>
  );
}
