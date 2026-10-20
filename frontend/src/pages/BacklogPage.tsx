import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import { api } from "../api/client";
import { useBoard, useInvalidateProjectData, useIssues, useSprints, useUpdateIssue } from "../api/queries";
import type { Issue, Sprint } from "../api/types";
import { useCan } from "../auth/AuthContext";
import CreateIssueModal from "../components/CreateIssueModal";
import { TYPE_ICON } from "../components/IssueCard";
import IssueDrawer from "../components/IssueDrawer";

export default function BacklogPage() {
  const projectId = Number(useParams().projectId);
  const { data: board } = useBoard(projectId);
  const { data: sprints = [] } = useSprints(projectId);
  const { data: issues = [] } = useIssues({ project: String(projectId), ordering: "number" });
  const canEdit = useCan("member");
  const [openIssue, setOpenIssue] = useState<number | null>(null);
  const [createIn, setCreateIn] = useState<number | null | undefined>(undefined);
  const invalidate = useInvalidateProjectData();

  const sprintAction = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "start" | "complete" }) =>
      api(`/sprints/${id}/${action}/`, { method: "POST", body: {} }),
    onSuccess: invalidate,
  });

  const open = sprints.filter((s) => s.state !== "closed").sort((a, b) => (a.state === "active" ? -1 : b.state === "active" ? 1 : a.id - b.id));
  const statusName = Object.fromEntries((board?.columns ?? []).map((c) => [c.id, c.name]));
  const doneIds = new Set((board?.columns ?? []).filter((c) => c.category === "done").map((c) => c.id));
  const hasActive = sprints.some((s) => s.state === "active");

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted small">{board?.project.name}</p>
          <h1>Backlog</h1>
        </div>
        {canEdit && <NewSprint projectId={projectId} count={sprints.length} />}
      </header>

      {open.map((sprint) => (
        <SprintSection
          key={sprint.id}
          sprint={sprint}
          issues={issues.filter((i) => i.sprint === sprint.id)}
          statusName={statusName}
          doneIds={doneIds}
          canEdit={canEdit}
          canStart={!hasActive}
          sprints={open}
          onOpen={setOpenIssue}
          onCreate={() => setCreateIn(sprint.id)}
          onAction={(action) => sprintAction.mutate({ id: sprint.id, action })}
        />
      ))}

      <SprintSection
        title="Backlog"
        issues={issues.filter((i) => i.sprint === null)}
        statusName={statusName}
        doneIds={doneIds}
        canEdit={canEdit}
        sprints={open}
        onOpen={setOpenIssue}
        onCreate={() => setCreateIn(null)}
      />

      {sprintAction.error && <div className="toast">{sprintAction.error.message}</div>}
      {createIn !== undefined && <CreateIssueModal projectId={projectId} sprintId={createIn} onClose={() => setCreateIn(undefined)} />}
      {openIssue !== null && board && (
        <IssueDrawer issueId={openIssue} statuses={board.columns} onClose={() => setOpenIssue(null)} />
      )}
    </div>
  );
}

interface SectionProps {
  sprint?: Sprint;
  title?: string;
  issues: Issue[];
  statusName: Record<number, string>;
  doneIds: Set<number>;
  canEdit: boolean;
  canStart?: boolean;
  sprints: Sprint[];
  onOpen(id: number): void;
  onCreate(): void;
  onAction?(action: "start" | "complete"): void;
}

function SprintSection({ sprint, title, issues, statusName, doneIds, canEdit, canStart, sprints, onOpen, onCreate, onAction }: SectionProps) {
  const update = useUpdateIssue();
  const points = issues.reduce((sum, i) => sum + (i.story_points ?? 0), 0);
  const done = issues.filter((i) => doneIds.has(i.status)).length;

  return (
    <section className="sprint-section">
      <header>
        <div>
          <strong>{sprint?.name ?? title}</strong>
          {sprint?.state === "active" && <span className="badge badge-active">Active</span>}
          <span className="muted small">
            {" "}
            {issues.length} issues · {points} pts{sprint ? ` · ${done} done` : ""}
          </span>
          {sprint?.goal && <div className="muted small">{sprint.goal}</div>}
        </div>
        {canEdit && sprint && onAction && (
          sprint.state === "active" ? (
            <button className="btn" onClick={() => onAction("complete")}>
              Complete sprint
            </button>
          ) : (
            <button className="btn" disabled={!canStart || issues.length === 0} onClick={() => onAction("start")}>
              Start sprint
            </button>
          )
        )}
      </header>
      <ul className="issue-list">
        {issues.map((issue) => (
          <li key={issue.id} onClick={() => onOpen(issue.id)}>
            <span className={`type-icon type-${issue.type}`}>{TYPE_ICON[issue.type]}</span>
            <span className="issue-key">{issue.key}</span>
            <span className="grow">{issue.title}</span>
            <span className="status-pill">{statusName[issue.status]}</span>
            {canEdit && (
              <select
                className="sprint-picker"
                value={issue.sprint ?? ""}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => update.mutate({ id: issue.id, sprint: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Backlog</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <span className="points">{issue.story_points ?? "–"}</span>
          </li>
        ))}
        {issues.length === 0 && <li className="muted empty-row">No issues</li>}
      </ul>
      {canEdit && (
        <button className="btn btn-ghost add-issue" onClick={onCreate}>
          + Create issue
        </button>
      )}
    </section>
  );
}

function NewSprint({ projectId, count }: { projectId: number; count: number }) {
  const invalidate = useInvalidateProjectData();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const create = useMutation({
    mutationFn: () => api("/sprints/", { method: "POST", body: { project: projectId, name, goal } }),
    onSuccess: () => {
      invalidate();
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <button
        className="btn btn-primary"
        onClick={() => {
          setName(`Sprint ${count + 1}`);
          setGoal("");
          setOpen(true);
        }}
      >
        New sprint
      </button>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <form className="inline-form compact" onSubmit={submit}>
      <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Sprint goal" />
      <button className="btn btn-primary" disabled={create.isPending}>
        Create
      </button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
