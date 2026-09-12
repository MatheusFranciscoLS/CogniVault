import assert from 'node:assert/strict';
import test from 'node:test';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AdminController } from './admin.controller';

function capture() {
  let statusCode = 200;
  let payload: any;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { payload = value; return this; },
  } as unknown as Response;
  return { res, read: () => ({ statusCode, payload }) };
}

function request(body: Record<string, unknown>, id = 'user-target'): AuthenticatedRequest {
  return {
    body,
    params: { id },
    user: { id: 'admin-1', role: 'ADMIN', tenantId: 'tenant-1' },
  } as unknown as AuthenticatedRequest;
}

test('admin user creation rejects malformed or oversized email before database access', async () => {
  for (const email of ['sem-arroba', `${'a'.repeat(250)}@x.com`]) {
    const result = capture();
    await new AdminController().createUser(request({ email, password: '123456' }), result.res);
    assert.equal(result.read().statusCode, 400);
  }
});

test('admin user creation and update reject oversized passwords', async () => {
  const create = capture();
  await new AdminController().createUser(request({ email: 'novo@teste.com', password: 'x'.repeat(201) }), create.res);
  assert.equal(create.read().statusCode, 400);

  const update = capture();
  await new AdminController().updateUser(request({ password: 'x'.repeat(201) }), update.res);
  assert.equal(update.read().statusCode, 400);
});

test('admin user update rejects oversized identifiers before database access', async () => {
  const result = capture();
  await new AdminController().updateUser(request({}, 'u'.repeat(101)), result.res);
  assert.equal(result.read().statusCode, 400);
  assert.match(result.read().payload?.error || '', /usuário inválido/i);
});
