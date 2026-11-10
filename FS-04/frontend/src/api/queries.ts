import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { Board, Burndown, Issue, Member, Overview, Page, Project, Sprint } from "./types";

export const keys = {
  projects: ["projects"] as const,
  project: (id: number) => ["projects", id] as const,
  board: (id: number) => ["board", id] as const,
  issue: (id: number) => ["issue", id] as const,
  issues: (params: string) => ["issues", params] as const,
  sprints: (projectId: number) => ["sprints", projectId] as const,
  members: ["members"] as const,
  overview: ["overview"] as const,
  burndown: (sprintId: number) => ["burndown", sprintId] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: () => api<Page<Project>>("/projects/?limit=200").then((p) => p.results),
  });
}

export function useBoard(projectId: number) {
  return useQuery({ queryKey: keys.board(projectId), queryFn: () => api<Board>(`/projects/${projectId}/board/`) });
}

export function useIssue(id: number | null) {
  return useQuery({
    queryKey: keys.issue(id ?? 0),
    queryFn: () => api<Issue>(`/issues/${id}/`),
    enabled: id !== null,
  });
}

export function useIssues(params: Record<string, string>) {
  const qs = new URLSearchParams({ limit: "500", ...params }).toString();
  return useQuery({
    queryKey: keys.issues(qs),
    queryFn: () => api<Page<Issue>>(`/issues/?${qs}`).then((p) => p.results),
  });
}

export function useSprints(projectId: number) {
  return useQuery({
    queryKey: keys.sprints(projectId),
    queryFn: () => api<Sprint[]>(`/sprints/?project=${projectId}`),
    enabled: projectId > 0,
  });
}

export function useOverview() {
  return useQuery({ queryKey: keys.overview, queryFn: () => api<Overview>("/overview/") });
}

export function useBurndown(sprintId: number | null) {
  return useQuery({
    queryKey: keys.burndown(sprintId ?? 0),
    queryFn: () => api<Burndown>(`/sprints/${sprintId}/burndown/`),
    enabled: sprintId !== null,
  });
}

export function useMembers() {
  return useQuery({ queryKey: keys.members, queryFn: () => api<Member[]>("/members/") });
}

export function useInvalidateProjectData() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["board"] }),
      qc.invalidateQueries({ queryKey: ["issues"] }),
      qc.invalidateQueries({ queryKey: ["issue"] }),
      qc.invalidateQueries({ queryKey: ["sprints"] }),
      qc.invalidateQueries({ queryKey: ["history"] }),
      qc.invalidateQueries({ queryKey: keys.projects }),
      qc.invalidateQueries({ queryKey: keys.overview }),
      qc.invalidateQueries({ queryKey: ["burndown"] }),
    ]);
}

export function useUpdateIssue() {
  const invalidate = useInvalidateProjectData();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Issue> & { id: number }) =>
      api<Issue>(`/issues/${id}/`, { method: "PATCH", body: patch }),
    onSuccess: invalidate,
  });
}

export function useCreateIssue() {
  const invalidate = useInvalidateProjectData();
  return useMutation({
    mutationFn: (body: Partial<Issue>) => api<Issue>("/issues/", { method: "POST", body }),
    onSuccess: invalidate,
  });
}
