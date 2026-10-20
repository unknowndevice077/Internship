import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { BoardIssue } from "../api/types";

export const TYPE_ICON: Record<BoardIssue["type"], string> = {
  task: "✓",
  bug: "●",
  story: "■",
  epic: "⚡",
};

export function IssueCardBody({ issue }: { issue: BoardIssue }) {
  return (
    <>
      <div className="card-title">{issue.title}</div>
      <div className="card-meta">
        <span className={`type-icon type-${issue.type}`} title={issue.type}>
          {TYPE_ICON[issue.type]}
        </span>
        <span className="issue-key">{issue.key}</span>
        <span className={`priority priority-${issue.priority}`} title={`${issue.priority} priority`} />
        {issue.story_points != null && <span className="points">{issue.story_points}</span>}
        {issue.assignee && (
          <span className="avatar avatar-sm" title={issue.assignee.full_name || issue.assignee.email}>
            {(issue.assignee.full_name || issue.assignee.email)[0].toUpperCase()}
          </span>
        )}
      </div>
    </>
  );
}

export default function IssueCard({ issue, onOpen, disabled }: { issue: BoardIssue; onOpen(id: number): void; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id, disabled });

  return (
    <div
      ref={setNodeRef}
      className={`issue-card ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => onOpen(issue.id)}
      {...attributes}
      {...listeners}
    >
      <IssueCardBody issue={issue} />
    </div>
  );
}
