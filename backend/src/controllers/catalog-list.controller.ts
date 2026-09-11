import { Response } from 'express';
import { LRUCache } from 'lru-cache';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { repairMultipartText } from '../utils/text-encoding';
import { CATALOG_CATEGORY_NAMES, inferCatalogCategory } from '../services/catalog-category';
import {
  inferCatalogModelFromFilename,
  isLikelyHusqvarnaPnc,
  isPlausibleCatalogModel,
  normalizeHusqvarnaPnc,
} from '../services/catalog-extractor';
import {
  findEngineApplications,
  findMachinesForEngine,
  formatBriggsEngineModel,
  inferEquipmentFamily,
} from '../services/husqvarna-domain-knowledge';

const LIST_FRESH_MS = Math.max(2_000, Number(process.env.CATALOG_LIST_CACHE_FRESH_MS || '5000') || 5_000);
const LIST_STALE_MS = Math.max(LIST_FRESH_MS, Number(process.env.CATALOG_LIST_CACHE_STALE_MS || '30000') || 30_000);

const select = {
  id: true,
  filename: true,
  status: true,
  manufacturer: true,
  model: true,
  pnc: true,
  createdAt: true,
  archivedAt: true,
  processingJobId: true,
  processingStage: true,
  processingCurrent: true,
  processingTotal: true,
  processingError: true,
  extractionMethod: true,
  healthScore: true,
  reviewStatus: true,
  reviewReasons: true,
  qualityCheckedAt: true,
  category: { select: { name: true } },
  _count: { select: { parts: { where: { active: true } } } },
} as const;

type CatalogRecord = Prisma.DocumentGetPayload<{ select: typeof select }>;
type CatalogPayload = { documents: ReturnType<typeof toListItem>[]; categories: readonly string[] };
type CacheEntry = { payload: CatalogPayload; refreshedAt: number };

const cache = new LRUCache<string, CacheEntry>({ max: 300, ttl: LIST_STALE_MS });
const refreshes = new Map<string, Promise<CatalogPayload>>();

function safeFilename(value: string): string {
  const repaired = repairMultipartText(value);
  const filename = repaired.replace(/\\/g, '/').split('/').pop()?.trim() || 'catalogo.pdf';
  return filename.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 240) || 'catalogo.pdf';
}

function toListItem(document: CatalogRecord, partPncs: string[] = []) {
  const filename = safeFilename(document.filename);
  const resolvedManufacturer = document.manufacturer || null;
  const rawModel = document.model || null;
  const resolvedModel = formatBriggsEngineModel(rawModel, filename, resolvedManufacturer, { includeMachine: true }) || rawModel;
  const isBriggsModel = /^Motor\s+Briggs\b/i.test(resolvedModel || '')
    || /^(?:12J|104M|21R|31R|44T|40N|33R|3054|25T|19L|15T|12D|12E|12H|11P|09P|08P|093J|122T|126M|121P)/i.test(resolvedModel || '');
  const modelNeedsReview = !isBriggsModel && !isPlausibleCatalogModel(resolvedModel);
  const suggestedModel = modelNeedsReview ? inferCatalogModelFromFilename(filename) || null : null;
  const effectiveModel = resolvedModel || suggestedModel || '';
  const pncs = [...new Set(
    [document.pnc || '', ...partPncs]
      .filter(isLikelyHusqvarnaPnc)
      .map(normalizeHusqvarnaPnc),
  )];

  const storedCategory = document.category?.name;
  const inferredCategory = inferCatalogCategory({
    filename,
    manufacturer: resolvedManufacturer,
    model: effectiveModel,
    models: effectiveModel ? [effectiveModel] : [],
    parts: [],
  });
  const category = storedCategory && storedCategory !== 'Outros / Não identificado'
    ? storedCategory
    : (inferredCategory !== 'Outros / Não identificado' ? inferredCategory : (storedCategory || 'Outros / Não identificado'));

  const isEngineCatalog = category === 'Motores'
    || isBriggsModel
    || /^(?:motor|engine|kawasaki\s+f[rsx]|kohler|briggs)\b/i.test(effectiveModel)
    || /\b(?:motor\s+briggs|kawasaki\s+engine|kohler\s+engine)\b/i.test(filename);

  const applications = isEngineCatalog
    ? findMachinesForEngine(effectiveModel, filename).map(app => {
        const family = inferEquipmentFamily('', app.machineModel);
        const typeLabel = family === 'WALK_MOWER' ? 'Cortador de Grama'
          : family === 'ZERO_TURN' ? 'Giro Zero'
          : family === 'GARDEN_TRACTOR' ? 'Trator'
          : family === 'RIDER' ? 'Rider'
          : 'Máquina';
        return {
          machineModel: app.machineModel,
          machinePnc: app.machinePnc,
          label: `${app.machineModel} (${typeLabel})`,
        };
      })
    : [];

  const engineApplications = !isEngineCatalog
    ? findEngineApplications(effectiveModel).map(app => {
        const engineModel = formatBriggsEngineModel(app.engineModel, undefined, undefined, { includeMachine: false }) || app.engineModel;
        return {
          engineModel,
          engineArticle: app.engineArticle,
          label: `Motor ${engineModel}`,
        };
      })
    : [];

  return {
    id: document.id,
    filename,
    status: document.status,
    manufacturer: resolvedManufacturer,
    model: resolvedModel,
    pnc: document.pnc,
    pncs,
    suggestedModel,
    modelNeedsReview,
    category,
    applications,
    engineApplications,
    createdAt: document.createdAt,
    partCount: document._count.parts,
    archivedAt: document.archivedAt,
    processingActive: Boolean(document.processingJobId),
    processingStage: document.processingStage,
    processingCurrent: document.processingCurrent,
    processingTotal: document.processingTotal,
    processingError: document.processingError,
    extractionMethod: document.extractionMethod,
    healthScore: document.healthScore,
    reviewStatus: document.reviewStatus,
    reviewReasons: document.reviewReasons,
    qualityCheckedAt: document.qualityCheckedAt,
  };
}

async function loadCatalogs(tenantId: string, includeArchived: boolean): Promise<CatalogPayload> {
  const documents = await prisma.document.findMany({
    where: {
      tenantId,
      ...(includeArchived ? {} : { archivedAt: null }),
      processingStage: { not: 'REMOVED' },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select,
  });

  const pncRows = documents.length
    ? await prisma.part.findMany({
        where: {
          documentId: { in: documents.map(document => document.id) },
          active: true,
          pnc: { not: null },
          document: { tenantId },
        },
        distinct: ['documentId', 'pnc'],
        select: { documentId: true, pnc: true },
      })
    : [];

  const pncsByDocument = new Map<string, string[]>();
  for (const row of pncRows) {
    if (!row.pnc) continue;
    const pncs = pncsByDocument.get(row.documentId) || [];
    pncs.push(row.pnc);
    pncsByDocument.set(row.documentId, pncs);
  }

  const items = documents.map(document => toListItem(document, pncsByDocument.get(document.id)));
  items.sort((left, right) => {
    const keyA = left.model?.trim() || left.filename;
    const keyB = right.model?.trim() || right.filename;
    return keyA.localeCompare(keyB, 'pt-BR', { numeric: true, sensitivity: 'base' });
  });

  return { documents: items, categories: CATALOG_CATEGORY_NAMES };
}

async function refresh(key: string, tenantId: string, includeArchived: boolean): Promise<CatalogPayload> {
  const pending = refreshes.get(key);
  if (pending) return pending;
  const promise = loadCatalogs(tenantId, includeArchived)
    .then(payload => {
      cache.set(key, { payload, refreshedAt: Date.now() });
      return payload;
    })
    .finally(() => refreshes.delete(key));
  refreshes.set(key, promise);
  return promise;
}

export function invalidateCatalogListCache(tenantId?: string): void {
  if (!tenantId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${tenantId}:`)) cache.delete(key);
  }
}

export class CatalogListController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    const includeArchived = req.user.role === 'ADMIN' && req.query.includeArchived === 'true';
    const key = `${req.user.tenantId}:${includeArchived ? 'all' : 'active'}`;
    const cached = cache.get(key);

    if (cached) {
      const age = Date.now() - cached.refreshedAt;
      res.set('Cache-Control', 'private, max-age=2, stale-while-revalidate=10');
      if (age <= LIST_FRESH_MS) {
        res.set('X-CogniVault-Cache', 'HIT');
      } else {
        res.set('X-CogniVault-Cache', 'STALE');
        void refresh(key, req.user.tenantId, includeArchived).catch(error => {
          console.warn('⚠️ Não foi possível atualizar lista de catálogos em segundo plano:', error);
        });
      }
      res.status(200).json(cached.payload);
      return;
    }

    try {
      const payload = await refresh(key, req.user.tenantId, includeArchived);
      res.set('X-CogniVault-Cache', 'MISS');
      res.set('Cache-Control', 'private, max-age=2, stale-while-revalidate=10');
      res.status(200).json(payload);
    } catch (error) {
      console.error('❌ Erro ao listar catálogos:', error);
      res.status(500).json({ error: 'Erro ao listar catálogos.' });
    }
  }
}
