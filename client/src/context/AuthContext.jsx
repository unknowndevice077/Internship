import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setVendor(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api('/auth/me');
      setUser(data.user);
      setVendor(data.vendor);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAuth = (data) => {
    setToken(data.token);
    setUser(data.user);
    setVendor(data.vendor);
    return data.user;
  };

  const value = useMemo(
    () => ({
      user,
      vendor,
      setVendor,
      loading,
      refresh,
      login: async (email, password) => handleAuth(await api('/auth/login', { method: 'POST', body: { email, password } })),
      register: async (form) => handleAuth(await api('/auth/register', { method: 'POST', body: form })),
      logout: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => {});
        setToken(null);
        setUser(null);
        setVendor(null);
      },
    }),
    [user, vendor, loading, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
