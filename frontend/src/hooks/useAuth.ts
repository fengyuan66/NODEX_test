import { useCallback } from 'react';
import { authApi } from '../api/client';
import { useAuthStore } from '../store/authStore';

export function useAuth() {
  const { user, loading, setUser, setLoading } = useAuthStore();

  const checkAuth = useCallback(async () => {
    try {
      const res = await authApi.me();
      if (res.data.authenticated && res.data.email) {
        setUser({ email: res.data.email });
        return true;
      }
    } catch (_) {}
    setUser(null);
    return false;
  }, [setUser]);

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    setLoading(true);
    try {
      const res = await authApi.login(email, password, remember);
      if (res.data.ok) {
        setUser({ email });
        return { ok: true, next_url: res.data.next_url };
      }
      return { ok: false, error: res.data.error };
    } finally {
      setLoading(false);
    }
  }, [setUser, setLoading]);

  const signup = useCallback(async (email: string, password: string, remember: boolean) => {
    setLoading(true);
    try {
      const res = await authApi.signup(email, password, remember);
      if (res.data.ok) {
        setUser({ email });
        return { ok: true, next_url: res.data.next_url };
      }
      return { ok: false, error: res.data.error };
    } finally {
      setLoading(false);
    }
  }, [setUser, setLoading]);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, [setUser]);

  return { user, loading, checkAuth, login, signup, logout };
}
