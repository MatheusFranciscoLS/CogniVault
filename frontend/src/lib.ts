export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3333').replace(/\/$/, '');

export function getToken() { return localStorage.getItem('cognivault_token') || ''; }
export function clearSession() {
  ['cognivault_token','cognivault_tenant','cognivault_role','cognivault_email'].forEach(k => localStorage.removeItem(k));
}
export async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401) clearSession();
  return response;
}
export async function json<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Erro na requisição.');
  return data as T;
}
export function fmtDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
