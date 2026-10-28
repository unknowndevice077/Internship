import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { api, session } from "../api/client";
import type { Me } from "../api/types";
import { AuthContext, type AuthState } from "./context";

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
      // drop cached tenant data
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    },
    [queryClient],
  );

  const login = useCallback(
    async (email: string, password: string, otp?: string) => {
      const tokens = await api<{ access: string; refresh: string }>("/auth/token/", {
        method: "POST",
        body: { email, password, ...(otp ? { otp } : {}) },
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

  const refreshMe = useCallback(() => queryClient.invalidateQueries({ queryKey: ["me"] }), [queryClient]);

  const logout = useCallback(() => {
    // revoke the refresh token server side; failing to reach the API shouldn't block signing out
    if (session.refresh) {
      api("/auth/logout/", { method: "POST", body: { refresh: session.refresh }, auth: false }).catch(() => {});
    }
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
      refreshMe,
    }),
    [me, hasToken, meQuery.isLoading, workspace, login, register, logout, switchWorkspace, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
