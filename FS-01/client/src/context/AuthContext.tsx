import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, getToken, setToken } from '../api/client';
import type { Role, User, Vendor } from '../types';

interface AuthResponse {
  token: string;
  user: User;
  vendor: Vendor | null;
}

export interface RegisterForm {
  name: string;
  email: string;
  password: string;
  role: Exclude<Role, 'admin'>;
}

interface AuthValue {
  user: User | null;
  vendor: Vendor | null;
  setVendor: (v: Vendor | null) => void;
  setUser: (u: User | null) => void;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  register: (form: RegisterForm) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setVendor(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api<{ user: User; vendor: Vendor | null }>('/auth/me');
      setUser(data.user);
      setVendor(data.vendor);
    } catch (err) {
      // api() already drops the token on a 401; a 500 or network blip shouldn't log you out
      if (err instanceof ApiError && err.status === 401) setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<AuthValue>(() => {
    const handleAuth = (data: AuthResponse) => {
      setToken(data.token);
      setUser(data.user);
      setVendor(data.vendor);
      return data.user;
    };
    return {
      user,
      vendor,
      setVendor,
      setUser,
      loading,
      refresh,
      login: async (email, password) =>
        handleAuth(await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } })),
      register: async (form) =>
        handleAuth(await api<AuthResponse>('/auth/register', { method: 'POST', body: form })),
      logout: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => {});
        setToken(null);
        setUser(null);
        setVendor(null);
      },
    };
  }, [user, vendor, loading, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
