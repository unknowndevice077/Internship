import { useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { useBoard } from "../api/queries";
import { useCan } from "../auth/useAuth";
import CreateIssueModal from "../components/CreateIssueModal";
import IssueDrawer from "../components/IssueDrawer";
import KanbanBoard from "../components/KanbanBoard";
import { BoardSkeleton } from "../components/Skeleton";
import { useShortcut } from "../components/useShortcut";

export default function BoardPage() {
  const projectId = Number(useParams().projectId);
  const { data: board, isLoading, error } = useBoard(projectId);
  const canEdit = useCan("member");
  const [openIssue, setOpenIssue] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useShortcut("c", () => setCreating(true), canEdit && !creating && openIssue === null);
  useShortcut("/", () => searchRef.current?.focus());

  // filtering is client side, the board is already loaded
  const columns = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !board) return board?.columns ?? [];
    return board.columns.map((c) => ({
      ...c,
      issues: c.issues.filter((i) => i.key.toLowerCase().includes(q) || i.title.toLowerCase().includes(q)),
    }));
  }, [board, query]);
  const filtering = query.trim() !== "";

  if (isLoading)
    return (
      <div className="page page-board" aria-busy="true">
        <BoardSkeleton />
      </div>
    );
  if (error || !board) return <div className="page">Could not load this board.</div>;

  return (
    <div className="page page-board">
      <header className="page-header">
        <div>
          <p className="muted small">{board.project.name}</p>
          <h1>{board.project.key} board</h1>
        </div>
        <div className="header-actions">
          <input
            ref={searchRef}
            className="search"
            type="search"
            placeholder="Filter cards  ( / )"
            aria-label="Filter cards"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setCreating(true)} title="Shortcut: c">
              Create issue
            </button>
          )}
        </div>
      </header>
      {filtering && <p className="muted small">Clear the filter to move cards.</p>}

      <KanbanBoard
        projectId={projectId}
        columns={columns}
        transitions={board.transitions}
        canEdit={canEdit && !filtering}
        onOpen={setOpenIssue}
        onMoveError={(msg) => {
          setToast(msg);
          setTimeout(() => setToast(""), 4000);
        }}
      />

      {toast && <div className="toast">{toast}</div>}
      {creating && <CreateIssueModal projectId={projectId} onClose={() => setCreating(false)} />}
      {openIssue !== null && (
        <IssueDrawer
          issueId={openIssue}
          statuses={board.columns}
          transitions={board.transitions}
          onClose={() => setOpenIssue(null)}
        />
      )}
    </div>
  );
}
