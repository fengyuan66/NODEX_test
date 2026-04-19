import { create } from 'zustand';

interface AuthState {
  user: { email: string } | null;
  loading: boolean;
  setUser: (user: { email: string } | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
}));
