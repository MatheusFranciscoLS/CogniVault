import assert from 'node:assert/strict';
import test from 'node:test';
import { createStorageFetch, storageRequestTimeoutMs } from './supabase-storage';

test('storage timeout keeps a safe bounded range', () => {
  assert.equal(storageRequestTimeoutMs(undefined), 60_000);
  assert.equal(storageRequestTimeoutMs('1'), 5_000);
  assert.equal(storageRequestTimeoutMs('60000'), 60_000);
  assert.equal(storageRequestTimeoutMs('999999'), 120_000);
});

test('storage fetch aborts a stalled upstream request', async () => {
  const stalledFetch = ((_: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error('missing abort signal'));
        return;
      }

      const abort = () => reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    })) as typeof fetch;

  const timedFetch = createStorageFetch(stalledFetch, 10);
  await assert.rejects(
    () => timedFetch('https://storage.example.test/catalog.pdf'),
    (error: unknown) => error instanceof Error && (error.name === 'TimeoutError' || /timeout/i.test(error.message)),
  );
});
