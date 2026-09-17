import { NextFunction, Response } from 'express';
import { LRUCache } from 'lru-cache';
import { AuthenticatedRequest } from './auth.middleware';

const QUALITY_OVERVIEW_TTL_MS = 30_000;

type QualityOverviewPayload = Record<string, unknown>;

const qualityOverviewCache = new LRUCache<string, QualityOverviewPayload>({
  max: 100,
  ttl: QUALITY_OVERVIEW_TTL_MS,
});

export function invalidateQualityOverviewCache(tenantId?: string): void {
  if (tenantId) {
    qualityOverviewCache.delete(tenantId);
    return;
  }
  qualityOverviewCache.clear();
}

export function qualityOverviewCacheMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    next();
    return;
  }

  const cached = qualityOverviewCache.get(tenantId);
  if (cached) {
    res.set('X-CogniVault-Cache', 'HIT');
    res.set('Cache-Control', 'private, max-age=10');
    res.json(cached);
    return;
  }

  res.set('X-CogniVault-Cache', 'MISS');
  res.set('Cache-Control', 'private, max-age=10');

  const originalJson = res.json.bind(res);
  res.json = ((payload: QualityOverviewPayload) => {
    if (res.statusCode >= 200 && res.statusCode < 300 && payload && typeof payload === 'object') {
      qualityOverviewCache.set(tenantId, payload);
    }
    return originalJson(payload);
  }) as Response['json'];

  next();
}
