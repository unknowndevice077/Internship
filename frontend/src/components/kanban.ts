import type { BoardColumn, BoardIssue, IssueType } from "../api/types";

export const TYPE_ICON: Record<IssueType, string> = {
  task: "✓",
  bug: "●",
  story: "■",
  epic: "⚡",
};

export type ColumnMap = Record<number, BoardIssue[]>;

export const columnId = (statusId: number) => `col-${statusId}`;

export function toColumnMap(columns: BoardColumn[]): ColumnMap {
  return Object.fromEntries(columns.map((c) => [c.id, c.issues]));
}

export function findColumn(map: ColumnMap, id: string | number): number | undefined {
  if (typeof id === "string" && id.startsWith("col-")) return Number(id.slice(4));
  const entry = Object.entries(map).find(([, issues]) => issues.some((i) => i.id === id));
  return entry ? Number(entry[0]) : undefined;
}

export function moveCard(map: ColumnMap, issueId: number, toColumn: number, toIndex: number): ColumnMap {
  const fromColumn = findColumn(map, issueId);
  if (fromColumn === undefined) return map;
  const card = map[fromColumn].find((i) => i.id === issueId)!;
  const next: ColumnMap = { ...map, [fromColumn]: map[fromColumn].filter((i) => i.id !== issueId) };
  const target = [...next[toColumn]];
  target.splice(Math.max(0, Math.min(toIndex, target.length)), 0, { ...card, status: toColumn });
  next[toColumn] = target;
  return next;
}

// neighbours for POST /issues/{id}/move/
export function neighbours(map: ColumnMap, issueId: number) {
  const column = findColumn(map, issueId);
  if (column === undefined) return null;
  const list = map[column];
  const index = list.findIndex((i) => i.id === issueId);
  return {
    status: column,
    before: list[index - 1]?.id ?? null,
    after: list[index + 1]?.id ?? null,
  };
}

// no transitions = open workflow
export function allowedTargets(transitions: [number, number][], from: number) {
  if (transitions.length === 0) return () => true;
  const targets = new Set(transitions.filter(([f]) => f === from).map(([, t]) => t));
  return (to: number) => to === from || targets.has(to);
}
