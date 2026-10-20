import { useState } from "react";
import { useParams } from "react-router-dom";

import { useBoard } from "../api/queries";
import { useCan } from "../auth/AuthContext";
import CreateIssueModal from "../components/CreateIssueModal";
import IssueDrawer from "../components/IssueDrawer";
import KanbanBoard from "../components/KanbanBoard";

export default function BoardPage() {
  const projectId = Number(useParams().projectId);
  const { data: board, isLoading, error } = useBoard(projectId);
  const canEdit = useCan("member");
  const [openIssue, setOpenIssue] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState("");

  if (isLoading) return <div className="page muted">Loading board…</div>;
  if (error || !board) return <div className="page">Could not load this board.</div>;

  return (
    <div className="page page-board">
      <header className="page-header">
        <div>
          <p className="muted small">{board.project.name}</p>
          <h1>{board.project.key} board</h1>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            Create issue
          </button>
        )}
      </header>

      <KanbanBoard
        projectId={projectId}
        columns={board.columns}
        canEdit={canEdit}
        onOpen={setOpenIssue}
        onMoveError={(msg) => {
          setToast(msg);
          setTimeout(() => setToast(""), 4000);
        }}
      />

      {toast && <div className="toast">{toast}</div>}
      {creating && <CreateIssueModal projectId={projectId} onClose={() => setCreating(false)} />}
      {openIssue !== null && (
        <IssueDrawer issueId={openIssue} statuses={board.columns} onClose={() => setOpenIssue(null)} />
      )}
    </div>
  );
}
