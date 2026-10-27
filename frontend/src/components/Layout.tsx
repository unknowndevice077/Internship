import { useState } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";

import { api } from "../api/client";

import { useProjects } from "../api/queries";
import { useAuth, useCan } from "../auth/useAuth";
import NotificationBell from "./NotificationBell";

export default function Layout() {
  const { me, workspace, switchWorkspace, logout } = useAuth();
  const { data: projects = [] } = useProjects();
  const { projectId } = useParams();
  const isAdmin = useCan("admin");

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">Sprintboard</div>
          <NotificationBell />
        </div>

        <select
          className="ws-switcher"
          value={workspace?.slug}
          onChange={(e) => switchWorkspace(e.target.value)}
          aria-label="Workspace"
        >
          {me?.workspaces.map((w) => (
            <option key={w.slug} value={w.slug}>
              {w.name}
            </option>
          ))}
        </select>

        <nav>
          <NavLink to="/" end>
            Projects
          </NavLink>
          <NavLink to="/settings">Settings</NavLink>
          {isAdmin && <NavLink to="/billing">Billing</NavLink>}
          {projects.map((p) => (
            <div key={p.id} className={`nav-project ${String(p.id) === projectId ? "open" : ""}`}>
              <span className="nav-project-name">
                <span className="project-key">{p.key}</span> {p.name}
              </span>
              <NavLink to={`/projects/${p.id}/board`}>Board</NavLink>
              <NavLink to={`/projects/${p.id}/backlog`}>Backlog</NavLink>
              <NavLink to={`/projects/${p.id}/reports`}>Reports</NavLink>
              {isAdmin && <NavLink to={`/projects/${p.id}/settings`}>Workflow</NavLink>}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="me">
            <div className="avatar">{(me?.full_name || me?.email || "?")[0].toUpperCase()}</div>
            <div>
              <div>{me?.full_name || me?.email}</div>
              <div className="muted small">{workspace?.role}</div>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        {me && !me.email_verified && <VerifyBanner email={me.email} />}
        <Outlet />
      </main>
    </div>
  );
}

function VerifyBanner({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function resend() {
    setState("sending");
    try {
      await api("/auth/verify-email/resend/", { method: "POST" });
      setState("sent");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="notice verify-banner" role="status">
      <span>Confirm your email address. We sent a link to {email}.</span>
      {state === "sent" ? (
        <span className="muted">Sent, check your inbox.</span>
      ) : (
        <button className="btn btn-ghost" onClick={resend} disabled={state === "sending"}>
          {state === "failed" ? "Try again" : "Resend email"}
        </button>
      )}
    </div>
  );
}
