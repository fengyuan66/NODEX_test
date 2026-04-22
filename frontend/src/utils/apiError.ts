import axios from 'axios';

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response?.data && typeof err.response.data === 'object') {
    const d = err.response.data as { error?: unknown };
    if (d.error !== undefined && d.error !== null && String(d.error).trim()) {
      return String(d.error).trim();
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
