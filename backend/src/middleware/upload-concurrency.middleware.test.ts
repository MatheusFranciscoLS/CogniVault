import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import type { Request, Response } from 'express';
import { uploadConcurrencyMiddleware, uploadConcurrencySnapshot } from './upload-concurrency.middleware';

class FakeResponse extends EventEmitter {
  statusCode = 200;
  body: unknown = null;
  headers = new Map<string, string>();

  set(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  json(body: unknown): this {
    this.body = body;
    return this;
  }
}

function response(): FakeResponse & Response {
  return new FakeResponse() as FakeResponse & Response;
}

const request = {} as Request;

test('rejects a concurrent upload before downstream middleware starts', () => {
  const first = response();
  let firstCalls = 0;
  uploadConcurrencyMiddleware(request, first, () => { firstCalls += 1; });
  assert.equal(firstCalls, 1);
  assert.equal(uploadConcurrencySnapshot().active, 1);

  const duplicate = response();
  let duplicateCalls = 0;
  uploadConcurrencyMiddleware(request, duplicate, () => { duplicateCalls += 1; });

  assert.equal(duplicateCalls, 0);
  assert.equal(duplicate.statusCode, 429);
  assert.equal(duplicate.headers.get('Retry-After'), '5');

  first.emit('finish');
  assert.equal(uploadConcurrencySnapshot().active, 0);
});

test('releases capacity on close and synchronous downstream failures', () => {
  const closed = response();
  uploadConcurrencyMiddleware(request, closed, () => undefined);
  closed.emit('close');
  assert.equal(uploadConcurrencySnapshot().active, 0);

  const failed = response();
  assert.throws(
    () => uploadConcurrencyMiddleware(request, failed, () => { throw new Error('boom'); }),
    /boom/,
  );
  assert.equal(uploadConcurrencySnapshot().active, 0);

  const retry = response();
  let retryCalls = 0;
  uploadConcurrencyMiddleware(request, retry, () => { retryCalls += 1; });
  assert.equal(retryCalls, 1);
  retry.emit('finish');
});
