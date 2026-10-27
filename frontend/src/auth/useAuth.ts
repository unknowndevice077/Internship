import { useContext } from "react";

import { AuthContext } from "./context";

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
