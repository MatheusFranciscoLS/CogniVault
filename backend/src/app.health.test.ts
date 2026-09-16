import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import app from './app';

async function closeServer(server: ReturnType<typeof app.listen>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test('GET /health/live reports liveness without cache and exposes deploy revision', async (t) => {
  const previousRevision = process.env.RENDER_GIT_COMMIT;
  process.env.RENDER_GIT_COMMIT = 'abcdef1234567890abcdef1234567890abcdef12';

  const server = app.listen(0);
  t.after(async () => {
    if (previousRevision === undefined) delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT = previousRevision;
    await closeServer(server);
  });

  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/health/live`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-powered-by'), null);

  const body = await response.json() as {
    status: string;
    revision: string | null;
    uptimeSeconds: number;
    timestamp: string;
  };

  assert.equal(body.status, 'ok');
  assert.equal(body.revision, 'abcdef123456');
  assert.equal(Number.isFinite(body.uptimeSeconds), true);
  assert.equal(Number.isNaN(Date.parse(body.timestamp)), false);
});

test('HEAD /health/live stays lightweight and cache-free', async (t) => {
  const server = app.listen(0);
  t.after(() => closeServer(server));

  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/health/live`, { method: 'HEAD' });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), '');
});
