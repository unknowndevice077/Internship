import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api } from "../api/client";
import { keys } from "../api/queries";
import type { BoardColumn, BoardIssue } from "../api/types";
import IssueCard, { IssueCardBody } from "./IssueCard";
import { allowedTargets, columnId, findColumn, moveCard, neighbours, toColumnMap, type ColumnMap } from "./kanban";

interface Props {
  projectId: number;
  columns: BoardColumn[];
  transitions: [number, number][];
  canEdit: boolean;
  onOpen(id: number): void;
  onMoveError(message: string): void;
}

export default function KanbanBoard({ projectId, columns, transitions, canEdit, onOpen, onMoveError }: Props) {
  const qc = useQueryClient();
  const [map, setMap] = useState<ColumnMap>(() => toColumnMap(columns));
  const [active, setActive] = useState<BoardIssue | null>(null);
  const [startColumn, setStartColumn] = useState<number | null>(null);

  useEffect(() => {
    if (!active) setMap(toColumnMap(columns));
  }, [columns, active]);

  const sensors = useSensors(
    // small distance so a plain click still opens the issue
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const move = useMutation({
    mutationFn: (body: { id: number; status: number; before: number | null; after: number | null }) =>
      api(`/issues/${body.id}/move/`, { method: "POST", body }),
    onError: (err: Error) => {
      onMoveError(err.message);
      setMap(toColumnMap(columns));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.board(projectId) }),
  });

  function handleDragStart({ active }: DragStartEvent) {
    const id = Number(active.id);
    const col = findColumn(map, id);
    setStartColumn(col ?? null);
    setActive(col !== undefined ? map[col].find((i) => i.id === id) ?? null : null);
  }

  // crossing into another column: move the card there right away so the list makes room for it
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = findColumn(map, active.id);
    const to = findColumn(map, over.id);
    if (from === undefined || to === undefined || from === to) return;
    if (startColumn !== null && !allowedTargets(transitions, startColumn)(to)) return;
    const overIndex = map[to].findIndex((i) => i.id === over.id);
    setMap((m) => moveCard(m, Number(active.id), to, overIndex === -1 ? m[to].length : overIndex));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const id = Number(active.id);
    setActive(null);
    if (!over) {
      setMap(toColumnMap(columns));
      return;
    }
    const col = findColumn(map, id)!;
    const overCol = findColumn(map, over.id);
    let next = map;
    if (overCol === col && over.id !== active.id) {
      const overIndex = map[col].findIndex((i) => i.id === over.id);
      if (overIndex !== -1) next = moveCard(map, id, col, overIndex);
    }
    setMap(next);

    const pos = neighbours(next, id)!;
    const original = columns.find((c) => c.id === startColumn)?.issues ?? [];
    const oldIndex = original.findIndex((i) => i.id === id);
    const unchanged =
      pos.status === startColumn &&
      (original[oldIndex - 1]?.id ?? null) === pos.before &&
      (original[oldIndex + 1]?.id ?? null) === pos.after;
    if (!unchanged) move.mutate({ id, ...pos });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActive(null);
        setMap(toColumnMap(columns));
      }}
    >
      <div className="board">
        {columns.map((col) => (
          <Column
            key={col.id}
            column={col}
            issues={map[col.id] ?? []}
            canEdit={canEdit}
            blocked={active !== null && startColumn !== null && !allowedTargets(transitions, startColumn)(col.id)}
            onOpen={onOpen}
          />
        ))}
      </div>
      <DragOverlay>{active && <div className="issue-card overlay"><IssueCardBody issue={active} /></div>}</DragOverlay>
    </DndContext>
  );
}

interface ColumnProps {
  column: BoardColumn;
  issues: BoardIssue[];
  canEdit: boolean;
  blocked: boolean;
  onOpen(id: number): void;
}

function Column({ column, issues, canEdit, blocked, onOpen }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId(column.id), disabled: blocked });
  return (
    <section className={`column column-${column.category} ${isOver ? "over" : ""} ${blocked ? "blocked" : ""}`}>
      <header className="column-header">
        <span>{column.name}</span>
        <span className="count">{issues.length}</span>
      </header>
      <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="column-body">
          {issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} onOpen={onOpen} disabled={!canEdit} />
          ))}
          {issues.length === 0 && <div className="column-empty">Drop issues here</div>}
        </div>
      </SortableContext>
    </section>
  );
}
