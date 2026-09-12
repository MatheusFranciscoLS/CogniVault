import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import type { Response } from 'express';
import type { AuthenticatedRequest } from './auth.middleware';
import { tenantOperationSingleFlight } from './tenant-operation-single-flight.middleware';

class FakeResponse extends EventEmitter {
  statusCode = 200;
  body: unknown = null;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  json(body: unknown): this {
    this.body = body;
    return this;
  }
}

function requestFor(tenantId: string): AuthenticatedRequest {
  return {
    user: {
      id: `user-${tenantId}`,
      tenantId,
      role: 'ADMIN',
      email: `${tenantId}@example.com`,
    },
  } as AuthenticatedRequest;
}

function response(): FakeResponse & Response {
  return new FakeResponse() as FakeResponse & Response;
}

test('blocks duplicate heavy work for the same tenant until the first response finishes', () => {
  const guard = tenantOperationSingleFlight('test-benchmark');
  const firstResponse = response();
  let firstCalls = 0;

  guard(requestFor('tenant-a'), firstResponse, () => { firstCalls += 1; });
  assert.equal(firstCalls, 1);

  const duplicateResponse = response();
  let duplicateCalls = 0;
  guard(requestFor('tenant-a'), duplicateResponse, () => { duplicateCalls += 1; });

  assert.equal(duplicateCalls, 0);
  assert.equal(duplicateResponse.statusCode, 409);
  assert.deepEqual(duplicateResponse.body, { error: 'Esta operação já está em andamento para esta empresa.' });

  firstResponse.emit('finish');

  const afterFinish = response();
  let afterFinishCalls = 0;
  guard(requestFor('tenant-a'), afterFinish, () => { afterFinishCalls += 1; });
  assert.equal(afterFinishCalls, 1);
  afterFinish.emit('finish');
});

test('allows the same maintenance operation to run for different tenants', () => {
  const guard = tenantOperationSingleFlight('test-rebuild');
  const responseA = response();
  const responseB = response();
  let calls = 0;

  guard(requestFor('tenant-a'), responseA, () => { calls += 1; });
  guard(requestFor('tenant-b'), responseB, () => { calls += 1; });

  assert.equal(calls, 2);
  responseA.emit('finish');
  responseB.emit('finish');
});

test('releases the operation when downstream code throws synchronously', () => {
  const guard = tenantOperationSingleFlight('test-throw');
  const failedResponse = response();

  assert.throws(
    () => guard(requestFor('tenant-a'), failedResponse, () => { throw new Error('boom'); }),
    /boom/,
  );

  const retryResponse = response();
  let retryCalls = 0;
  guard(requestFor('tenant-a'), retryResponse, () => { retryCalls += 1; });
  assert.equal(retryCalls, 1);
  retryResponse.emit('finish');
});
