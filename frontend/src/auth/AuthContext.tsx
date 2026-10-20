import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { api, session } from "../api/client";
import type { Me, WorkspaceBrief } from "../api/types";

interface AuthState {
  me: Me | undefined;
  loading: boolean;
  workspace: WorkspaceBrief | undefined;
  login(email: string, password: string): Promise<void>;
  register(data: { email: string; password: string; full_name?: string; workspace_name?: string }): Promise<void>;
  logout(): void;
  switchWorkspace(slug: string): void;
  refreshMe(): Promise<unknown>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [slug, setSlug] = useState(session.workspace);
  const [hasToken, setHasToken] = useState(Boolean(session.access));

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/auth/me/"),
    enabled: hasToken,
    retry: false,
  });
  const me = meQuery.data;

  const workspace = me?.workspaces.find((w) => w.slug === slug) ?? me?.workspaces[0];
  if (workspace && workspace.slug !== session.workspace) session.setWorkspace(workspace.slug);

  const switchWorkspace = useCallback(
    (next: string) => {
      session.setWorkspace(next);
      setSlug(next);
      // everything except "me" is tenant data, so drop it when switching
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    },
    [queryClient],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await api<{ access: string; refresh: string }>("/auth/token/", {
        method: "POST",
        body: { email, password },
        auth: false,
      });
      session.setTokens(tokens.access, tokens.refresh);
      setHasToken(true);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    [queryClient],
  );

  const register = useCallback<AuthState["register"]>(
    async (data) => {
      const res = await api<{ access: string; refresh: string; user: Me }>("/auth/register/", {
        method: "POST",
        body: data,
        auth: false,
      });
      session.setTokens(res.access, res.refresh);
      queryClient.setQueryData(["me"], res.user);
      setHasToken(true);
    },
    [queryClient],
  );

  const logout = useCallback(() => {
    session.clear();
    session.setWorkspace(null);
    setHasToken(false);
    setSlug(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({
      me,
      loading: hasToken && meQuery.isLoading,
      workspace,
      login,
      register,
      logout,
      switchWorkspace,
      refreshMe: () => meQuery.refetch(),
    }),
    [me, hasToken, meQuery, workspace, login, register, logout, switchWorkspace],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

const RANK = { viewer: 0, member: 1, admin: 2, owner: 3 } as const;

export function useCan(minimum: keyof typeof RANK) {
  const { workspace } = useAuth();
  return workspace ? RANK[workspace.role] >= RANK[minimum] : false;
}
