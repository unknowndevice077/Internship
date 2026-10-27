import { createContext } from "react";

import type { Me, WorkspaceBrief } from "../api/types";

export interface AuthState {
  me: Me | undefined;
  loading: boolean;
  workspace: WorkspaceBrief | undefined;
  login(email: string, password: string): Promise<void>;
  register(data: { email: string; password: string; full_name?: string; workspace_name?: string }): Promise<void>;
  logout(): void;
  switchWorkspace(slug: string): void;
  refreshMe(): Promise<unknown>;
}

export const AuthContext = createContext<AuthState | null>(null);
