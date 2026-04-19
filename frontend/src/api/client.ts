import axios from 'axios';
import type { GraphData } from '../types';

const api = axios.create({
  baseURL: '/',
  withCredentials: true,
});

export const authApi = {
  signup: (email: string, password: string, remember: boolean) =>
    api.post<{ ok?: boolean; error?: string; next_url?: string }>('/auth/signup', { email, password, remember }),
  login: (email: string, password: string, remember: boolean) =>
    api.post<{ ok?: boolean; error?: string; next_url?: string }>('/auth/login', { email, password, remember }),
  logout: () => api.get('/auth/logout'),
  me: () => api.get<{ authenticated: boolean; email?: string }>('/auth/me'),
};

export const graphApi = {
  load: () => api.get<GraphData>('/load'),
  save: (data: GraphData) => api.post('/save', data),
  loadShared: (shareId: string) => api.get<GraphData>(`/load_shared/${shareId}`),
  createShare: () => api.post<{ share_id: string }>('/share/create'),
  invite: (shareId: string, email: string) => api.post('/share/invite', { share_id: shareId, email }),
  dashboard: () => api.get('/api/dashboard'),
  collaborators: (shareId: string) => api.get(`/api/collaborators/${shareId}`),
};

export const aiApi = {
  classify: (input: string) => api.post<{ type: string; seconds?: number }>('/classify', { input }),
  chat: (prompt: string, context: string) => api.post<{ reply: string }>('/chat', { prompt, context }),
  suggest: (prompt: string, context: string) => api.post<{ suggestions: string[] }>('/suggest', { prompt, context }),
  merge: (a: string, b: string) => api.post<{ merged: string }>('/merge', { a, b }),
  find: (query: string, nodes: { id: number; text: string }[]) =>
    api.post<{ nodeId: number | null }>('/find', { query, nodes }),
  brainstorm: (topic: string) => api.post<{ nodes: string[] }>('/brainstorm', { topic }),
};

export const settingsApi = {
  save: (settings: Record<string, unknown>) => api.post('/save_settings', settings),
  load: () => api.get<Record<string, unknown>>('/load_settings'),
};

export default api;
