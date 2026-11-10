import { describe, expect, it } from "vitest";

import type { BoardIssue } from "../api/types";
import { allowedTargets, findColumn, moveCard, neighbours, type ColumnMap } from "./kanban";

const card = (id: number, status: number): BoardIssue => ({
  id,
  key: `WEB-${id}`,
  title: `Issue ${id}`,
  type: "task",
  priority: "medium",
  status,
  sprint: null,
  assignee: null,
  story_points: null,
  rank: id,
});

const board = (): ColumnMap => ({
  1: [card(1, 1), card(2, 1)],
  2: [card(3, 2)],
  3: [],
});

describe("kanban helpers", () => {
  it("finds the column of a card or a column droppable", () => {
    expect(findColumn(board(), 3)).toBe(2);
    expect(findColumn(board(), "col-3")).toBe(3);
    expect(findColumn(board(), 99)).toBeUndefined();
  });

  it("moves a card into another column at an index", () => {
    const next = moveCard(board(), 1, 2, 1);
    expect(next[1].map((i) => i.id)).toEqual([2]);
    expect(next[2].map((i) => i.id)).toEqual([3, 1]);
    expect(next[2][1].status).toBe(2);
  });

  it("drops into an empty column", () => {
    const next = moveCard(board(), 2, 3, 0);
    expect(next[3].map((i) => i.id)).toEqual([2]);
  });

  it("reports the neighbours the API needs", () => {
    const next = moveCard(board(), 3, 1, 1);
    expect(neighbours(next, 3)).toEqual({ status: 1, before: 1, after: 2 });
    expect(neighbours(next, 1)).toEqual({ status: 1, before: null, after: 3 });
  });
});

describe("allowedTargets", () => {
  it("allows everything when the workflow is open", () => {
    expect(allowedTargets([], 1)(3)).toBe(true);
  });

  it("only allows configured moves", () => {
    const allowed = allowedTargets(
      [
        [1, 2],
        [2, 3],
      ],
      1,
    );
    expect(allowed(2)).toBe(true);
    expect(allowed(3)).toBe(false);
    expect(allowed(1)).toBe(true);
  });
});
