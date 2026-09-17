import assert from 'node:assert/strict';
import test from 'node:test';
import type { Response } from 'express';
import type { AuthenticatedRequest } from './auth.middleware';
import {
  invalidateQualityOverviewCache,
  qualityOverviewCacheMiddleware,
} from './quality-overview-cache.middleware';

function request(tenantId: string): AuthenticatedRequest {
  return {
    user: { id: `admin-${tenantId}`, role: 'ADMIN', tenantId },
  } as AuthenticatedRequest;
}

function response() {
  const headers = new Map<string, string>();
  let payload: unknown;
  const res = {
    statusCode: 200,
    set(name: string, value: string) { headers.set(name, value); return this; },
    json(value: unknown) { payload = value; return this; },
  } as unknown as Response;
  return {
    res,
    read: () => ({ headers, payload }),
  };
}

test('quality overview cache serves a tenant hit after the first successful response', () => {
  invalidateQualityOverviewCache();
  const first = response();
  let firstNext = false;
  qualityOverviewCacheMiddleware(request('tenant-a'), first.res, () => { firstNext = true; });
  assert.equal(firstNext, true);
  assert.equal(first.read().headers.get('X-CogniVault-Cache'), 'MISS');

  first.res.json({ quality: { summary: { parts: 10 } } });

  const second = response();
  let secondNext = false;
  qualityOverviewCacheMiddleware(request('tenant-a'), second.res, () => { secondNext = true; });
  assert.equal(secondNext, false);
  assert.equal(second.read().headers.get('X-CogniVault-Cache'), 'HIT');
  assert.deepEqual(second.read().payload, { quality: { summary: { parts: 10 } } });
});

test('quality overview cache is isolated by tenant and can be invalidated', () => {
  invalidateQualityOverviewCache();
  const first = response();
  qualityOverviewCacheMiddleware(request('tenant-a'), first.res, () => {});
  first.res.json({ quality: { tenant: 'a' } });

  const otherTenant = response();
  let otherNext = false;
  qualityOverviewCacheMiddleware(request('tenant-b'), otherTenant.res, () => { otherNext = true; });
  assert.equal(otherNext, true);
  assert.equal(otherTenant.read().headers.get('X-CogniVault-Cache'), 'MISS');

  invalidateQualityOverviewCache('tenant-a');
  const afterInvalidation = response();
  let nextAfterInvalidation = false;
  qualityOverviewCacheMiddleware(request('tenant-a'), afterInvalidation.res, () => { nextAfterInvalidation = true; });
  assert.equal(nextAfterInvalidation, true);
  assert.equal(afterInvalidation.read().headers.get('X-CogniVault-Cache'), 'MISS');
});
