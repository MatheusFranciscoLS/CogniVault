import assert from 'node:assert/strict';
import test from 'node:test';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { ProfileController } from './profile.controller';

function responseCapture() {
  let statusCode = 200;
  let body: any;
  const headers = new Map<string, string>();
  const res = {
    set(name: string, value: string) { headers.set(name.toLowerCase(), value); return this; },
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  } as unknown as Response;
  return {
    res,
    read: () => ({ statusCode, body, cacheControl: headers.get('cache-control') }),
  };
}

test('me never caches authenticated identity and exposes tenantId', async () => {
  const capture = responseCapture();
  const req = {
    user: {
      id: 'user-1',
      tenantId: 'tenant-1',
      tenantName: 'Vardão Máquinas',
      email: 'mecanico@example.com',
      role: 'MECHANIC',
      status: 'APPROVED',
    },
  } as AuthenticatedRequest;

  await new ProfileController().me(req, capture.res);
  const result = capture.read();

  assert.equal(result.statusCode, 200);
  assert.equal(result.cacheControl, 'no-store');
  assert.equal(result.body?.user?.tenantId, 'tenant-1');
  assert.equal(result.body?.user?.tenant?.id, 'tenant-1');
});

test('me does not cache unauthenticated responses', async () => {
  const capture = responseCapture();
  await new ProfileController().me({} as AuthenticatedRequest, capture.res);
  const result = capture.read();

  assert.equal(result.statusCode, 401);
  assert.equal(result.cacheControl, 'no-store');
});
