import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../api/client";
import type { Page } from "../api/types";

interface Notification {
  id: number;
  verb: string;
  text: string;
  issue: number | null;
  issue_key: string | null;
  project: number | null;
  read_at: string | null;
  created_at: string;
}

export default function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: unread } = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: () => api<{ count: number }>("/notifications/unread-count/"),
    refetchInterval: 30_000,
  });
  const { data: list } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => api<Page<Notification>>("/notifications/?limit=20"),
    enabled: open,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const markRead = useMutation({ mutationFn: (id: number) => api(`/notifications/${id}/read/`, { method: "POST" }), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => api("/notifications/read-all/", { method: "POST" }), onSuccess: refresh });

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const count = unread?.count ?? 0;

  return (
    <div className="bell" ref={ref}>
      <button className="btn btn-ghost bell-button" onClick={() => setOpen(!open)} aria-label={`Notifications (${count} unread)`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {count > 0 && <span className="bell-count">{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <div className="bell-panel">
          <div className="bell-header">
            <strong>Notifications</strong>
            {count > 0 && (
              <button className="link small" onClick={() => markAll.mutate()}>
                Mark all read
              </button>
            )}
          </div>
          {!list ? (
            <p className="muted small pad">Loading…</p>
          ) : list.results.length === 0 ? (
            <p className="muted small pad">You're all caught up.</p>
          ) : (
            <ul>
              {list.results.map((n) => (
                <li
                  key={n.id}
                  className={n.read_at ? "" : "unread"}
                  onClick={() => {
                    if (!n.read_at) markRead.mutate(n.id);
                    if (n.project) navigate(`/projects/${n.project}/board`);
                    setOpen(false);
                  }}
                >
                  <div>{n.text}</div>
                  <div className="muted small">{new Date(n.created_at).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
