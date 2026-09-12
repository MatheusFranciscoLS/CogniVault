import assert from 'node:assert/strict';
import test from 'node:test';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { FeedbackController } from './feedback.controller';

function captureResponse() {
  let statusCode = 200;
  let payload: any;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { payload = value; return this; },
  } as unknown as Response;
  return { res, read: () => ({ statusCode, payload }) };
}

function request(body: Record<string, unknown>, id = 'feedback-1'): AuthenticatedRequest {
  return {
    body,
    params: { id },
    user: { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-1' },
  } as unknown as AuthenticatedRequest;
}

test('feedback rejects oversized original queries before touching the database', async () => {
  const capture = captureResponse();
  await new FeedbackController().create(request({
    query: 'x'.repeat(501),
    partId: 'part-1',
    correct: true,
  }), capture.res);
  assert.equal(capture.read().statusCode, 400);
});

test('feedback rejects malformed PNC input instead of silently dropping it', async () => {
  const capture = captureResponse();
  await new FeedbackController().create(request({
    query: 'filtro de ar',
    partId: 'part-1',
    correct: true,
    pnc: 12345,
  }), capture.res);
  const result = capture.read();
  assert.equal(result.statusCode, 400);
  assert.match(result.payload?.error || '', /PNC inválido/i);
});
