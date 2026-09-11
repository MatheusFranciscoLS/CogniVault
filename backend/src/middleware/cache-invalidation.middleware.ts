import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { normalizeIdentifier } from '../utils/normalize';
import { invalidateWorkContextCache } from '../controllers/work-context.controller';
import { invalidateDocumentAccessCache } from '../controllers/document-access.controller';
import { invalidateHomeResponseCache } from '../controllers/home.controller';
import { invalidatePartDetailResponseCache } from '../controllers/part-detail.controller';
import { invalidateCatalogListCache } from '../controllers/catalog-list.controller';

function successful(status: number): boolean {
  return status >= 200 && status < 300;
}

export function invalidateWorkContextAfterLocation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const tenantId = req.user?.tenantId;
  const normalizedPartNumber = normalizeIdentifier(String(req.params.code || ''));

  res.once('finish', () => {
    if (!tenantId || !normalizedPartNumber || !successful(res.statusCode)) return;
    invalidateWorkContextCache(tenantId, normalizedPartNumber);
  });

  next();
}

export function invalidateWorkContextAfterQuoteUsage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const tenantId = req.user?.tenantId;
  const items: unknown[] = Array.isArray(req.body?.items) ? req.body.items : [];
  const normalizedCodes: string[] = [...new Set<string>(
    items
      .map((item): string => {
        if (!item || typeof item !== 'object') return '';
        const value = (item as Record<string, unknown>).partNumber;
        return normalizeIdentifier(String(value || ''));
      })
      .filter((value): value is string => value.length > 0),
  )];

  res.once('finish', () => {
    if (!tenantId || !successful(res.statusCode)) return;
    for (const code of normalizedCodes) invalidateWorkContextCache(tenantId, code);
  });

  next();
}

export function invalidateFavoriteCachesAfterMutation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const tenantId = req.user?.tenantId;
  const userId = req.user?.id;

  res.once('finish', () => {
    if (!tenantId || !successful(res.statusCode)) return;
    invalidateHomeResponseCache(tenantId, userId);
    invalidatePartDetailResponseCache(tenantId);
  });

  next();
}

export function invalidateDocumentAccessAfterMutation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const tenantId = req.user?.tenantId;
  const documentId = String(req.params.id || '').trim();

  res.once('finish', () => {
    if (!tenantId || !documentId || !successful(res.statusCode)) return;
    invalidateDocumentAccessCache(tenantId, documentId);
    invalidateHomeResponseCache(tenantId);
    invalidatePartDetailResponseCache(tenantId);
    invalidateCatalogListCache(tenantId);
  });

  next();
}
