export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3333').replace(/\/$/, '');
export const SESSION_EXPIRED_EVENT = 'cognivault:session-expired';

export type ApiRequestInit = RequestInit & { timeoutMs?: number };

export class ApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getToken() { return localStorage.getItem('cognivault_token') || ''; }
export function clearSession() {
  ['cognivault_token','cognivault_tenant','cognivault_role','cognivault_email'].forEach(k => localStorage.removeItem(k));
}
export async function api(path: string, init: ApiRequestInit = {}) {
  const { timeoutMs = 30_000, signal: callerSignal, ...requestInit } = init;
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal) {
    if (callerSignal.aborted) abortFromCaller();
    else callerSignal.addEventListener('abort', abortFromCaller, { once: true });
  }

  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...requestInit,
      headers,
      signal: controller.signal,
    });

    if (response.status === 401 && token) {
      clearSession();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return response;
  } catch (error) {
    if (timedOut) {
      throw new ApiError('A operação demorou mais que o esperado. Tente novamente.');
    }
    if (callerSignal?.aborted) throw error;
    throw new ApiError('Não foi possível conectar ao CogniVault. Verifique sua internet e tente novamente.');
  } finally {
    window.clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}
export async function json<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  let data: Record<string, unknown> = {};

  if (contentType.includes('application/json')) {
    try { data = await response.json() as Record<string, unknown>; } catch { data = {}; }
  }

  if (!response.ok) {
    const message = typeof data.error === 'string'
      ? data.error
      : `Não foi possível concluir a operação (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export async function apiJson<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  return json<T>(await api(path, init));
}

export function fmtDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
