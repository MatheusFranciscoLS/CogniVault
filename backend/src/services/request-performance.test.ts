import assert from 'node:assert/strict';
import test from 'node:test';
import { metricPath } from './request-performance';

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
