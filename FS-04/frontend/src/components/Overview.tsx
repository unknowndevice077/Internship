import { Link } from "react-router-dom";

import { useOverview } from "../api/queries";
import type { Overview as OverviewData } from "../api/types";
import { timeAgo } from "../time";
import { CountUp, LineChart, Ring, SplitBar } from "./charts";
import { TYPE_ICON } from "./kanban";

type Activity = OverviewData["activity"][number];

const issueLink = (project: number, issue: number) => `/projects/${project}/board?issue=${issue}`;

function describe(a: Activity) {
  if (a.action === "moved") return "moved";
  if (a.action === "commented") return "commented on";
  if (a.action === "attached") return "attached a file to";
  if (a.action === "created") return a.entity === "issue" ? "created" : "added to";
  if (a.action === "deleted") return a.entity === "issue" ? "deleted" : "removed something from";
  const fields = Object.keys(a.changes);
  return fields.length ? `changed ${fields.slice(0, 2).join(" and ").replace(/_/g, " ")} on` : "updated";
}

function endsIn(days: number | null) {
  if (days == null) return "No end date";
  if (days === 0) return "Ends today";
  const n = Math.abs(days);
  return `${n} day${n === 1 ? "" : "s"} ${days > 0 ? "left" : "over"}`;
}

export function OverviewStats() {
  const { data } = useOverview();
  const tiles = [
    { label: "Open issues", value: data?.totals.open },
    { label: "In progress", value: data?.totals.in_progress },
    { label: "Done this week", value: data?.totals.done_this_week, hint: `${data?.totals.created_this_week ?? 0} new` },
    { label: "Assigned to you", value: data?.totals.mine },
  ];
  return (
    <div className="tiles" aria-busy={!data}>
      {tiles.map((t) => (
        <div key={t.label} className="tile">
          <span className="muted small">{t.label}</span>
          <strong>{t.value == null ? <span className="skeleton tile-skeleton" /> : <CountUp value={t.value} />}</strong>
          {t.hint && data && <span className="tile-hint">{t.hint}</span>}
        </div>
      ))}
    </div>
  );
}

export function OverviewPanels() {
  const { data } = useOverview();
  if (!data) return null;
  const total = Object.values(data.by_category).reduce((sum, n) => sum + (n ?? 0), 0);
  // a brand new workspace has nothing to chart yet
  if (!total) return null;

  return (
    <section className="overview" aria-label="Workspace overview">
      <div className="card panel panel-wide">
        <header>
          <h2>Created and completed</h2>
          <span className="muted small">Issues per day, last 14 days</span>
        </header>
        <LineChart
          unit="Issues"
          height={300}
          dates={data.trend.map((d) => d.date)}
          series={[
            { label: "Created", values: data.trend.map((d) => d.created) },
            { label: "Completed", values: data.trend.map((d) => d.completed) },
          ]}
        />
      </div>

      <div className="card panel">
        <header>
          <h2>Active sprints</h2>
        </header>
        {data.sprints.length ? (
          <ul className="sprint-rings">
            {data.sprints.map((s) => (
              <li key={s.id}>
                <Ring value={s.issues_done} total={s.issues_total} label={`${s.name}: issues done`} />
                <div>
                  <Link to={`/projects/${s.project}/backlog`}>
                    {s.project_key} · {s.name}
                  </Link>
                  <span className="muted small">
                    {s.issues_done} of {s.issues_total} issues, {s.points_done}/{s.points_total} pts
                  </span>
                  <span className="muted small">{endsIn(s.days_left)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No sprint is running. Start one from a project's backlog.</p>
        )}
        <header className="panel-sub">
          <h2>All issues</h2>
          <span className="muted small">{total} total</span>
        </header>
        <SplitBar
          segments={[
            { label: "To do", value: data.by_category.todo ?? 0, tone: "todo" },
            { label: "In progress", value: data.by_category.in_progress ?? 0, tone: "doing" },
            { label: "Done", value: data.by_category.done ?? 0, tone: "done" },
          ]}
        />
      </div>

      <div className="card panel">
        <header>
          <h2>Assigned to you</h2>
          <span className="muted small">{data.totals.mine} open</span>
        </header>
        {data.my_work.length ? (
          <ul className="work-list">
            {data.my_work.map((i) => (
              <li key={i.id}>
                <Link to={issueLink(i.project, i.id)}>
                  <span className={`type-icon type-${i.type}`}>{TYPE_ICON[i.type]}</span>
                  <span className="issue-key">{i.key}</span>
                  <span className="work-title">{i.title}</span>
                  <span className={`status-pill cat-${i.category}`}>{i.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nothing on your plate right now.</p>
        )}
      </div>

      <div className="card panel panel-wide">
        <header>
          <h2>Recent activity</h2>
        </header>
        {data.activity.length ? (
          <ul className="feed">
            {data.activity.map((a) => (
              <li key={a.id}>
                <span className="avatar avatar-sm">{a.actor[0].toUpperCase()}</span>
                <p>
                  <strong>{a.actor}</strong> {describe(a)} <Link to={issueLink(a.project, a.issue)}>{a.issue_key}</Link>{" "}
                  {a.action === "moved" && a.changes.status && <>to {String(a.changes.status[1])} </>}
                  <span className="muted">{a.issue_title}</span>
                </p>
                <time className="muted small">{timeAgo(a.created_at)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Changes to issues will show up here.</p>
        )}
      </div>
    </section>
  );
}
