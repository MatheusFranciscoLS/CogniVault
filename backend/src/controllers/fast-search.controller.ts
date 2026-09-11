import { NextFunction, Response } from 'express';
import { LRUCache } from 'lru-cache';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier } from '../utils/normalize';
import { classifyPartKind } from '../services/husqvarna-domain-knowledge';
import { preferCurrentPartNumbers } from '../services/part-supersession';
import { PartSearchService, type PartCandidate } from '../services/part-search.service';

interface FastSearchPayload {
  parts: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
}

type SearchPath = 'DIRECT_CODE' | 'CODE_PREFIX';
type CacheStatus = 'HIT' | 'MISS';
type FastSearchResolution = {
  payload: FastSearchPayload;
  path: SearchPath;
  cache: CacheStatus;
};

const exactSearchCache = new LRUCache<string, FastSearchPayload>({
  max: 1200,
  ttl: 5 * 60 * 1000,
});

const prefixSearchCache = new LRUCache<string, FastSearchPayload>({
  max: 1200,
  ttl: 3 * 60 * 1000,
});

export function invalidateFastSearchCaches(tenantId?: string): void {
  if (!tenantId) {
    exactSearchCache.clear();
    prefixSearchCache.clear();
    return;
  }

  for (const key of exactSearchCache.keys()) {
    if (key.startsWith(`${tenantId}:`)) exactSearchCache.delete(key);
  }
  for (const key of prefixSearchCache.keys()) {
    if (key.startsWith(`${tenantId}:`)) prefixSearchCache.delete(key);
  }
}

/**
 * Evita consultar o caminho de código para pesquisas claramente descritivas/modelos.
 * Códigos Husqvarna numéricos e códigos alfanuméricos longos de motores continuam cobertos.
 */
export function looksLikeExactPartCode(value: string): boolean {
  const raw = value.trim();
  const normalized = normalizeIdentifier(raw);
  if (normalized.length < 7 || normalized.length > 20) return false;

  if (/^\d{7,12}$/.test(normalized)) return true;

  const digitCount = (normalized.match(/\d/g) || []).length;
  const digitRatio = digitCount / normalized.length;
  const hasCatalogSeparators = /[\s\-_.]/.test(raw);

  if (hasCatalogSeparators && digitCount >= 6 && digitRatio >= 0.65) return true;
  return normalized.length >= 10 && digitCount >= 6 && digitRatio >= 0.6;
}

/**
 * Detecta digitação parcial de Part Number sem desviar modelos curtos como
 * MZ54, K770, FR691V ou 143RII para o caminho rápido de código.
 */
export function looksLikeTechnicalCodePrefix(value: string): boolean {
  const normalized = normalizeIdentifier(value);
  if (normalized.length < 5 || normalized.length > 8) return false;
  const digits = (normalized.match(/\d/g) || []).length;
  return digits >= 5 && digits / normalized.length >= 0.7;
}

/**
 * Limite superior exclusivo para range lexicográfico no índice btree.
 * Ex.: 58710 -> 58711. Assim evitamos LIKE '58710%', que pode virar seq scan.
 */
export function technicalCodePrefixUpperBound(value: string): string {
  const normalized = normalizeIdentifier(value);
  if (!normalized) return '\uffff';
  const lastIndex = normalized.length - 1;
  const nextChar = String.fromCharCode(normalized.charCodeAt(lastIndex) + 1);
  return `${normalized.slice(0, lastIndex)}${nextChar}`;
}

async function enrichCandidates(tenantId: string, candidates: PartCandidate[]): Promise<FastSearchPayload> {
  const normalizedNumbers = [...new Set(candidates.map(candidate => candidate.normalizedPartNumber).filter(Boolean))];
  const masterParts = normalizedNumbers.length
    ? await prisma.masterPart.findMany({
        where: { tenantId, normalizedNumber: { in: normalizedNumbers } },
      })
    : [];
  const masterByCode = new Map(masterParts.map(master => [master.normalizedNumber, master]));

  return {
    parts: candidates.slice(0, 40).map(candidate => {
      const master = masterByCode.get(candidate.normalizedPartNumber);
      return {
        id: candidate.id,
        name: candidate.name,
        partNumber: candidate.partNumber,
        manufacturer: candidate.manufacturer,
        model: candidate.model,
        pnc: candidate.universalAcrossPnc ? 'Qualquer um' : candidate.pnc,
        universalAcrossPnc: candidate.universalAcrossPnc,
        section: candidate.section,
        position: candidate.position,
        page: candidate.page,
        documentId: candidate.documentId,
        notes: candidate.notes,
        filename: candidate.filename,
        classification: classifyPartKind(candidate.name, candidate.section, candidate.notes),
        price: master?.price ?? null,
        ean: master?.ean ?? null,
        ncm: master?.ncm ?? null,
        officialName: master?.name ?? null,
        masterCategory: master?.category ?? null,
        brand: master?.brand ?? null,
      };
    }),
    documents: [],
  };
}

async function exactPayload(tenantId: string, query: string): Promise<FastSearchResolution | null> {
  if (!looksLikeExactPartCode(query)) return null;
  const normalized = normalizeIdentifier(query);
  const key = `${tenantId}:${normalized}`;
  const cached = exactSearchCache.get(key);
  if (cached) return { payload: cached, path: 'DIRECT_CODE', cache: 'HIT' };

  const candidates = await PartSearchService.directByCode(tenantId, query);
  if (!candidates.length) return null;

  const currentCandidates = preferCurrentPartNumbers(candidates);
  const payload = await enrichCandidates(tenantId, currentCandidates);
  exactSearchCache.set(key, payload);
  return { payload, path: 'DIRECT_CODE', cache: 'MISS' };
}

async function prefixPayload(tenantId: string, query: string): Promise<FastSearchResolution | null> {
  if (!looksLikeTechnicalCodePrefix(query)) return null;
  const normalized = normalizeIdentifier(query);
  const key = `${tenantId}:${normalized}`;
  const cached = prefixSearchCache.get(key);
  if (cached) return { payload: cached, path: 'CODE_PREFIX', cache: 'HIT' };

  const rows = await prisma.part.findMany({
    where: {
      normalizedPartNumber: {
        gte: normalized,
        lt: technicalCodePrefixUpperBound(normalized),
      },
      active: true,
      document: { tenantId, archivedAt: null, status: 'COMPLETED' },
    },
    include: { document: { select: { filename: true, pnc: true } } },
    orderBy: [{ normalizedPartNumber: 'asc' }, { model: 'asc' }],
    take: 40,
  });

  if (!rows.length) return null;

  const candidates: PartCandidate[] = rows.map(part => ({
    id: part.id,
    documentId: part.documentId,
    filename: part.document.filename,
    manufacturer: part.manufacturer,
    model: part.model,
    normalizedModel: part.normalizedModel,
    pnc: part.pnc || part.document.pnc,
    normalizedPnc: part.normalizedPnc || normalizeIdentifier(part.document.pnc) || null,
    universalAcrossPnc: part.document.pnc ? false : part.universalAcrossPnc,
    section: part.section,
    position: part.position,
    name: part.name,
    alternativeNames: part.alternativeNames,
    partNumber: part.partNumber,
    normalizedPartNumber: part.normalizedPartNumber,
    page: part.page,
    notes: part.notes,
    distance: 0,
    feedbackScore: 0,
    searchMethod: 'DIRECT_CODE',
    retrievalSources: ['DIRECT_CODE'],
    retrievalAgreement: 1,
  }));

  const currentCandidates = preferCurrentPartNumbers(candidates);
  const payload = await enrichCandidates(tenantId, currentCandidates);
  prefixSearchCache.set(key, payload);
  return { payload, path: 'CODE_PREFIX', cache: 'MISS' };
}

async function resolveFastSearch(tenantId: string, query: string): Promise<FastSearchResolution | null> {
  const exact = await exactPayload(tenantId, query);
  if (exact) return exact;
  return prefixPayload(tenantId, query);
}

function isFastSearchCandidate(query: string): boolean {
  return looksLikeExactPartCode(query) || looksLikeTechnicalCodePrefix(query);
}

export class FastSearchController {
  async search(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    if (!req.user) return;
    const q = String(req.query.q || '').trim();
    if (!isFastSearchCandidate(q)) {
      next();
      return;
    }

    try {
      const result = await resolveFastSearch(req.user.tenantId, q);
      if (!result) {
        next();
        return;
      }

      res.set('X-CogniVault-Search-Path', result.path);
      res.set('X-CogniVault-Cache', result.cache);
      res.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=240');
      res.json(result.payload);
    } catch (error) {
      console.warn('⚠️ Caminho rápido de código indisponível; usando busca completa.', error);
      next();
    }
  }

  async stream(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    if (!req.user) return;
    const q = String(req.query.q || '').trim();
    if (!isFastSearchCandidate(q)) {
      next();
      return;
    }

    try {
      const result = await resolveFastSearch(req.user.tenantId, q);
      if (!result) {
        next();
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('X-CogniVault-Search-Path', result.path);
      res.setHeader('X-CogniVault-Cache', result.cache);
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: 'lexical', ...result.payload })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (error) {
      console.warn('⚠️ Caminho rápido de código no stream indisponível; usando busca completa.', error);
      next();
    }
  }
}
