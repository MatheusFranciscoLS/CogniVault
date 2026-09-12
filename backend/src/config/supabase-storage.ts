import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

export const storageBucket = process.env.STORAGE_BUCKET || 'catalogos';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('❌ Chaves do Supabase não encontradas no .env');
}

export function storageRequestTimeoutMs(raw = process.env.STORAGE_REQUEST_TIMEOUT_MS): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 60_000;
  return Math.min(120_000, Math.max(5_000, Math.round(parsed)));
}

export function createStorageFetch(
  baseFetch: typeof fetch = globalThis.fetch,
  timeoutMs = storageRequestTimeoutMs(),
): typeof fetch {
  const timedFetch: typeof fetch = (input, init) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;

    return baseFetch(input, { ...init, signal });
  };

  return timedFetch;
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: createStorageFetch(),
  },
});
