import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authMe, authLogin, authLogout, authRefresh, quickLoginPost } from '../services/api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    try {
      const r = await authMe();
      setUser(r.user);
    } catch {
      // access mungkin kedaluwarsa → coba refresh sekali
      try { const r = await authRefresh(); setUser(r.user); }
      catch { setUser(null); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { check(); }, [check]);

  // Request mana pun yang balas 401 → anggap sesi habis.
  useEffect(() => {
    const onUnauth = () => setUser(null);
    window.addEventListener('auth:unauthorized', onUnauth);
    return () => window.removeEventListener('auth:unauthorized', onUnauth);
  }, []);

  const login = async (email, password) => {
    const r = await authLogin(email, password);
    setUser(r.user);
    return r.user;
  };
  const logout = async () => {
    try { await authLogout(); } catch { /* ignore */ }
    setUser(null);
  };
  const quickLogin = async (body) => {
    const r = await quickLoginPost(body);
    setUser(r.user);
    return r.user;
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, quickLogin, refresh: check }}>
      {children}
    </AuthCtx.Provider>
  );
}

// Helper hak akses per peran (cermin dari kebijakan backend).
export function useCan() {
  const { user } = useAuth();
  const role = user?.role;
  return {
    role,
    isViewer: role === 'pengamat',
    canWrite: !!role && role !== 'pengamat',
    canDelete: role === 'pemilik' || role === 'superadmin',
    canFinance: role === 'pemilik' || role === 'superadmin' || role === 'pengamat',
    canManageUsers: role === 'pemilik' || role === 'superadmin',
    isSuper: role === 'superadmin',
  };
}

export const ROLE_LABEL = {
  superadmin: 'Super Admin',
  pemilik: 'Pemilik',
  pekerja: 'Pekerja',
  pengamat: 'Pengamat',
};
