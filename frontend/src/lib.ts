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

export function formatHusqvarnaPartNumber(code: string): string {
  if (!code) return '';
  const digits = code.replace(/\D/g, '');
  if (digits.length === 9) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 8) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)}-${digits.slice(6)}`;
  }
  return code;
}

export function formatEngineOrCatalogModel(model?: string | null, manufacturer?: string | null, filename?: string | null): string {
  let raw = (model || '').trim();
  const rawMfg = (manufacturer || '').toLowerCase();
  const rawFile = (filename || '').toLowerCase();

  const isBriggs =
    rawMfg.includes('briggs') ||
    rawFile.includes('briggs') ||
    /briggs/i.test(raw) ||
    /^(?:12J|104M|21R|31R|44T|40N|33R|3054|25T|19L|15T|12D|12E|12H|11P|09P|08P|093J|122T|126M|121P)/i.test(raw) ||
    /^(?:[0-9]{2}[A-Z][0-9]{3}|[0-9]{3}[A-Z][0-9]{2}|[0-9]{5,6})[-_ ][0-9A-Z]{4}(?:[-_ ][0-9A-Z]{1,2})?$/i.test(raw);

  if (!isBriggs) return raw;

  if (!raw && filename) {
    const m = filename.match(/\b([0-9]{2}[A-Z][0-9]{3}[-_ ][0-9A-Z]{4}|[0-9]{5,6}[-_ ][0-9A-Z]{4}|104M02[-_ ][0-9A-Z]{4}|12J[0-9]{3}[-_ ][0-9A-Z]{4})\b/i);
    if (m) raw = m[1];
  }

  let baseModel: string;
  if (/^motor\s+briggs\b/i.test(raw)) {
    baseModel = raw.replace(/^motor\s+briggs\s*/i, 'Motor Briggs ');
  } else if (/^briggs\s*(?:&|and)?\s*(?:stratton)?\s*/i.test(raw)) {
    const cleanCode = raw.replace(/^briggs\s*(?:&|and)?\s*(?:stratton)?\s*(?:motor\s*)?/i, '').trim();
    baseModel = cleanCode ? `Motor Briggs ${cleanCode}` : 'Motor Briggs';
  } else {
    baseModel = raw ? `Motor Briggs ${raw}` : 'Motor Briggs';
  }

  // Detecta se faz parte de alguma máquina Husqvarna conhecida (ex: J55SL, LC121P)
  const hay = `${rawFile} ${raw}`.toUpperCase();
  if (hay.includes('J55SL') && !baseModel.toUpperCase().includes('J55SL')) {
    baseModel = `${baseModel} (Cortador J55SL)`;
  } else if (hay.includes('LC121P') && !baseModel.toUpperCase().includes('LC121P')) {
    baseModel = `${baseModel} (Cortador LC121P)`;
  } else if (hay.includes('LC121') && !baseModel.toUpperCase().includes('LC121')) {
    baseModel = `${baseModel} (Cortador LC121)`;
  }

  return baseModel;
}

export function cleanErpCode(code?: string | null): string {
  if (!code) return '';
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function classifyPartKind(name?: string | null, section?: string | null, notes?: string | null): {
  kind: 'ASSEMBLY' | 'REPAIR_KIT' | 'INDIVIDUAL_PART';
  label: string;
  badgeColor: string;
  description: string;
} {
  const text = `${name || ''} ${section || ''} ${notes || ''}`.toLowerCase();

  const isRepairKit = (
    /\b(?:kit\s+(?:de\s+)?reparo|jogo\s+(?:de\s+)?reparo|kit\s+(?:de\s+)?juntas|jogo\s+(?:de\s+)?juntas|kit\s+(?:de\s+)?vedacao|kit\s+(?:de\s+)?vedação|kit\s+diafragma|kit\s+membrana|repair\s+kit|gasket\s+set|seal\s+kit|diaphragm\s+kit|carburetor\s+kit|kit\s+carburador)\b/i.test(text) ||
    (/\b(?:kit|jogo)\b/i.test(text) && /\b(?:reparo|junta|juntas|vedacao|vedação|diafragma|membrana|mola|molas|retentor|retentores)\b/i.test(text))
  ) && !/\b(?:kit\s+(?:de\s+)?cilindro|kit\s+(?:do\s+)?motor|kit\s+(?:de\s+)?bloco)\b/i.test(text);

  if (isRepairKit) {
    return {
      kind: 'REPAIR_KIT',
      label: '[KIT REPARO]',
      badgeColor: 'amber',
      description: 'Kit de juntas, diafragmas ou componentes de reposição/reparo',
    };
  }

  const isAssembly = (
    /\b(?:conjunto|subconjunto|completo|completa|assembly|assy|bloco\s+do\s+motor|motor\s+completo|kit\s+(?:de\s+)?cilindro|cilindro\s+c\/\s*pistao|cilindro\s+com\s+pistao)\b/i.test(text) ||
    (/\bcarburador\b/i.test(text) && !/\b(?:corpo|tampa|parafuso|agulha|mola|eixo)\b/i.test(text)) ||
    (/\b(?:embreagem|transmissao|transmissão|bomba\s+de\s+oleo|bomba\s+de\s+óleo)\b/i.test(text) && /\b(?:completa|completo)\b/i.test(text))
  );

  if (isAssembly) {
    return {
      kind: 'ASSEMBLY',
      label: '[CONJUNTO COMPLETO]',
      badgeColor: 'emerald',
      description: 'Conjunto ou subconjunto montado completo',
    };
  }

  return {
    kind: 'INDIVIDUAL_PART',
    label: '[COMPONENTE INDIVIDUAL]',
    badgeColor: 'slate',
    description: 'Item avulso / componente individual',
  };
}


