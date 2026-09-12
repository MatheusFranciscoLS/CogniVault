import assert from 'node:assert/strict';
import test from 'node:test';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { ChatController } from './chat.controller';

function responseCapture() {
  let statusCode = 200;
  let body: any;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  } as unknown as Response;
  return { res, read: () => ({ statusCode, body }) };
}

function request(body: Record<string, unknown>): AuthenticatedRequest {
  return {
    body,
    user: { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-1' },
  } as AuthenticatedRequest;
}

test('chat rejects oversized questions before starting search or AI work', async () => {
  const capture = responseCapture();
  await new ChatController().ask(request({ question: 'x'.repeat(1001) }), capture.res);
  const result = capture.read();
  assert.equal(result.statusCode, 400);
  assert.match(result.body?.error || '', /1000 caracteres/i);
});

test('chat rejects oversized PNC values before starting search or AI work', async () => {
  const capture = responseCapture();
  await new ChatController().ask(request({ question: 'filtro de ar', pnc: '9'.repeat(81) }), capture.res);
  const result = capture.read();
  assert.equal(result.statusCode, 400);
  assert.match(result.body?.error || '', /PNC inválido/i);
});
