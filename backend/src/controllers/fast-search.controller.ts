import { NextFunction, Response } from 'express';
import { LRUCache } from 'lru-cache';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier } from '../utils/normalize';
import { classifyPartKind } from '../services/husqvarna-domain-knowledge';
import { PartSearchService, type PartCandidate } from '../services/part-search.service';

interface FastSearchPayload {
  parts: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
}

const exactSearchCache = new LRUCache<string, FastSearchPayload>({
  max: 1200,
  ttl: 5 * 60 * 1000,
});

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

async function exactPayload(tenantId: string, query: string): Promise<FastSearchPayload | null> {
  if (!looksLikeExactPartCode(query)) return null;
  const normalized = normalizeIdentifier(query);
  const key = `${tenantId}:${normalized}`;
  const cached = exactSearchCache.get(key);
  if (cached) return cached;

  const candidates = await PartSearchService.directByCode(tenantId, query);
  if (!candidates.length) return null;

  const payload = await enrichCandidates(tenantId, candidates);
  exactSearchCache.set(key, payload);
  return payload;
}

export class FastSearchController {
  async search(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    if (!req.user) return;
    const q = String(req.query.q || '').trim();
    if (!looksLikeExactPartCode(q)) {
      next();
      return;
    }

    try {
      const payload = await exactPayload(req.user.tenantId, q);
      if (!payload) {
        next();
        return;
      }

      res.set('X-CogniVault-Search-Path', 'DIRECT_CODE');
      res.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=240');
      res.json(payload);
    } catch (error) {
      console.warn('⚠️ Caminho rápido de código indisponível; usando busca completa.', error);
      next();
    }
  }

  async stream(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    if (!req.user) return;
    const q = String(req.query.q || '').trim();
    if (!looksLikeExactPartCode(q)) {
      next();
      return;
    }

    try {
      const payload = await exactPayload(req.user.tenantId, q);
      if (!payload) {
        next();
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('X-CogniVault-Search-Path', 'DIRECT_CODE');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: 'lexical', ...payload })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (error) {
      console.warn('⚠️ Caminho rápido de código no stream indisponível; usando busca completa.', error);
      next();
    }
  }
}
