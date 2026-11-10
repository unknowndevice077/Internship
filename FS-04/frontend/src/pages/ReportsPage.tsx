import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { api, downloadFile } from "../api/client";
import { useBoard, useBurndown, useSprints } from "../api/queries";
import type { Page, Sprint } from "../api/types";
import { useCan } from "../auth/useAuth";
import { LineChart } from "../components/charts";

interface SprintData {
  sprint: { name: string; start_date: string; end_date: string; goal: string };
  committed_issues: number;
  completed_issues: number;
  committed_points: number;
  completed_points: number;
  completion_rate: number | null;
  by_assignee: { name: string; issues: number; done: number; points: number; done_points: number }[];
  by_type: Record<string, number>;
}

interface Report {
  id: number;
  kind: "sprint" | "weekly";
  sprint: number | null;
  state: "pending" | "ready" | "failed";
  data: SprintData | Record<string, never>;
  error: string;
  created_at: string;
}

export default function ReportsPage() {
  const projectId = Number(useParams().projectId);
  const qc = useQueryClient();
  const canGenerate = useCan("member");
  const { data: board } = useBoard(projectId);
  const { data: sprints = [] } = useSprints(projectId);
  const [sprintId, setSprintId] = useState("");
  const { data: reports } = useQuery({
    queryKey: ["reports", projectId],
    queryFn: () => api<Page<Report>>(`/reports/?project=${projectId}&kind=sprint&limit=20`),
    refetchInterval: (q) => (q.state.data?.results.some((r) => r.state === "pending") ? 2000 : false),
  });
  const generate = useMutation({
    mutationFn: () => api("/reports/", { method: "POST", body: { kind: "sprint", sprint: Number(sprintId) } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports", projectId] }),
  });

  const sprintName = (id: number | null) => sprints.find((s) => s.id === id)?.name ?? "Sprint";

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted small">{board?.project.name}</p>
          <h1>Sprint reports</h1>
        </div>
        {canGenerate && sprints.length > 0 && (
          <div className="inline-form compact">
            <select value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
              <option value="">Choose a sprint…</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.state})
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              disabled={!sprintId || generate.isPending}
              onClick={() => generate.mutate()}
            >
              Generate
            </button>
          </div>
        )}
      </header>

      <BurndownCard sprints={sprints} />

      {!reports?.results.length && (
        <div className="empty">Reports are created automatically when a sprint is completed.</div>
      )}

      {reports?.results.map((r) => (
        <section key={r.id} className="card settings-section">
          <div className="report-header">
            <h2>{sprintName(r.sprint)}</h2>
            <span className="muted small">{new Date(r.created_at).toLocaleString()}</span>
            {r.state === "ready" && (
              <button
                className="btn btn-ghost small"
                onClick={() => downloadFile(`/api/reports/${r.id}/download/`, `sprint-report-${r.id}.csv`)}
              >
                Download CSV
              </button>
            )}
          </div>
          {r.state === "pending" && <p className="muted">Building report…</p>}
          {r.state === "failed" && <p className="form-error">Report failed: {r.error}</p>}
          {r.state === "ready" && "committed_points" in r.data && <SprintSummary data={r.data as SprintData} />}
        </section>
      ))}
    </div>
  );
}

function BurndownCard({ sprints }: { sprints: Sprint[] }) {
  const dated = sprints.filter((s) => s.start_date);
  const [picked, setPicked] = useState<number | null>(null);
  // the running sprint is the interesting one, otherwise the latest that has dates
  const current = picked ?? (dated.find((s) => s.state === "active") ?? dated[0])?.id ?? null;
  const { data } = useBurndown(current);
  if (current === null) return null;

  const plotted = data?.days.filter((d) => d.remaining != null) ?? [];
  const today = plotted[plotted.length - 1];
  return (
    <section className="card settings-section">
      <div className="report-header">
        <h2>Burndown</h2>
        <select aria-label="Burndown sprint" value={current} onChange={(e) => setPicked(Number(e.target.value))}>
          {dated.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.state})
            </option>
          ))}
        </select>
      </div>
      {data && (
        <>
          <p className="muted small">
            {data.total_points} points committed across {data.total_issues} issues
            {today ? `, ${today.remaining} left` : ""}.
          </p>
          <LineChart
            unit="Story points left"
            dates={data.days.map((d) => d.date)}
            series={[
              { label: "Remaining", values: data.days.map((d) => d.remaining) },
              { label: "Ideal", values: data.days.map((d) => d.ideal), reference: true },
            ]}
          />
        </>
      )}
    </section>
  );
}

function SprintSummary({ data }: { data: SprintData }) {
  const max = Math.max(1, ...data.by_assignee.map((a) => a.points));
  return (
    <>
      <div className="stats">
        <Stat label="Completed points" value={`${data.completed_points} / ${data.committed_points}`} />
        <Stat label="Completion" value={data.completion_rate == null ? "–" : `${data.completion_rate}%`} />
        <Stat label="Issues done" value={`${data.completed_issues} / ${data.committed_issues}`} />
      </div>
      <h3>By assignee</h3>
      <div className="bars">
        {data.by_assignee.map((a) => (
          <div key={a.name} className="bar-row">
            <span className="bar-label">{a.name}</span>
            <div className="bar-track">
              <div className="bar bar-total" style={{ width: `${(a.points / max) * 100}%` }} />
              <div className="bar bar-done" style={{ width: `${(a.done_points / max) * 100}%` }} />
            </div>
            <span className="muted small">
              {a.done_points}/{a.points} pts
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="muted small">{label}</div>
    </div>
  );
}
