import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import type { Request, Response } from 'express';
import {
  MAX_TRACKED_ROUTES,
  metricPath,
  performanceSnapshot,
  requestPerformanceMiddleware,
} from './request-performance';

test('métricas preservam nomes de endpoints estáticos', () => {
  assert.equal(metricPath('/notifications'), '/notifications');
  assert.equal(metricPath('/master-parts/search'), '/master-parts/search');
  assert.equal(metricPath('/admin/performance'), '/admin/performance');
  assert.equal(metricPath('/part-verifications/pending'), '/part-verifications/pending');
});

test('métricas ocultam UUIDs e códigos dinâmicos', () => {
  assert.equal(
    metricPath('/documents/123e4567-e89b-12d3-a456-426614174000/access'),
    '/documents/:id/access',
  );
  assert.equal(metricPath('/parts/531007803/work-context'), '/parts/:key/work-context');
  assert.equal(metricPath('/parts/2513962S/live-data'), '/parts/:key/live-data');
});

class FakeResponse extends EventEmitter {
  statusCode = 404;
  private readonly headers = new Map<string, string>();

  set(name: string, value: string): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  getHeader(name: string): string | undefined {
    return this.headers.get(name.toLowerCase());
  }
}

function alpha(value: number): string {
  let current = value + 1;
  let result = '';
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(97 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

function record(path: string): void {
  const req = {
    path,
    method: 'GET',
    header: () => undefined,
  } as unknown as Request;
  const res = new FakeResponse() as unknown as Response;
  let nextCalls = 0;

  requestPerformanceMiddleware(req, res, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  (res as unknown as FakeResponse).emit('finish');
}

test('métricas limitam rotas únicas para impedir crescimento indefinido de memória', () => {
  const total = MAX_TRACKED_ROUTES + 40;
  for (let index = 0; index < total; index += 1) {
    record(`/api/memoryprobe${alpha(index)}`);
  }

  const routes = performanceSnapshot().routes;
  assert.equal(routes.length <= MAX_TRACKED_ROUTES, true);
  assert.equal(routes.some(item => item.route === 'GET /api/memoryprobea'), false);
  assert.equal(routes.some(item => item.route === `GET /api/memoryprobe${alpha(total - 1)}`), true);
});
