import assert from 'node:assert/strict';
import test from 'node:test';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AdminController, validAdminPassword } from './admin.controller';

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

test('admin password policy requires 15-64 characters without exceeding bcrypt 72-byte input', () => {
  assert.equal(validAdminPassword('x'.repeat(14)), false);
  assert.equal(validAdminPassword('x'.repeat(15)), true);
  assert.equal(validAdminPassword('x'.repeat(64)), true);
  assert.equal(validAdminPassword('x'.repeat(65)), false);
  assert.equal(validAdminPassword('😀'.repeat(18)), true); // 72 UTF-8 bytes
  assert.equal(validAdminPassword('😀'.repeat(19)), false); // 76 UTF-8 bytes
  assert.equal(validAdminPassword({ value: 'x'.repeat(15) }), false);
});

test('admin user creation rejects malformed or oversized email before database access', async () => {
  for (const email of ['sem-arroba', `${'a'.repeat(250)}@x.com`]) {
    const result = capture();
    await new AdminController().createUser(request({ email, password: '123456' }), result.res);
    assert.equal(result.read().statusCode, 400);
  }
});

test('admin user creation and update reject passwords shorter than 15 characters before database access', async () => {
  const create = capture();
  await new AdminController().createUser(request({ email: 'novo@teste.com', password: 'x'.repeat(14) }), create.res);
  assert.equal(create.read().statusCode, 400);
  assert.match(create.read().payload?.error || '', /15/);

  const update = capture();
  await new AdminController().updateUser(request({ password: 'x'.repeat(14) }), update.res);
  assert.equal(update.read().statusCode, 400);
  assert.match(update.read().payload?.error || '', /15/);
});

test('admin user creation and update reject structured password payloads before database access', async () => {
  for (const password of [{ value: 'x'.repeat(15) }, ['x'.repeat(15)]]) {
    const create = capture();
    await new AdminController().createUser(request({ email: 'novo@teste.com', password }), create.res);
    assert.equal(create.read().statusCode, 400);

    const update = capture();
    await new AdminController().updateUser(request({ password }), update.res);
    assert.equal(update.read().statusCode, 400);
  }
});

test('admin user creation and update reject passwords that exceed safe bcrypt bounds', async () => {
  for (const password of ['x'.repeat(65), '😀'.repeat(19)]) {
    const create = capture();
    await new AdminController().createUser(request({ email: 'novo@teste.com', password }), create.res);
    assert.equal(create.read().statusCode, 400);
    assert.match(create.read().payload?.error || '', /64|72/);

    const update = capture();
    await new AdminController().updateUser(request({ password }), update.res);
    assert.equal(update.read().statusCode, 400);
    assert.match(update.read().payload?.error || '', /64|72/);
  }
});

test('admin user update rejects oversized identifiers before database access', async () => {
  const result = capture();
  await new AdminController().updateUser(request({}, 'u'.repeat(101)), result.res);
  assert.equal(result.read().statusCode, 400);
  assert.match(result.read().payload?.error || '', /usuário inválido/i);
});
