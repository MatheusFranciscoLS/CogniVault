import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { normalizeIdentifier } from '../utils/normalize';
import { invalidateWorkContextCache } from '../controllers/work-context.controller';
import { invalidateDocumentAccessCache } from '../controllers/document-access.controller';

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
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const normalizedCodes = [...new Set(
    items
      .map((item: unknown) => {
        if (!item || typeof item !== 'object') return '';
        const value = (item as Record<string, unknown>).partNumber;
        return normalizeIdentifier(String(value || ''));
      })
      .filter(Boolean),
  )];

  res.once('finish', () => {
    if (!tenantId || !successful(res.statusCode)) return;
    for (const code of normalizedCodes) invalidateWorkContextCache(tenantId, code);
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
  });

  next();
}
