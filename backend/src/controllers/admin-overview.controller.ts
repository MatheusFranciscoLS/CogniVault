import { Response } from 'express';
import { LRUCache } from 'lru-cache';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const FRESH_MS = 30_000;
const STALE_MS = 5 * 60 * 1000;

type OverviewPayload = {
  overview: {
    tenantName: string;
    users: number;
    activeDocuments: number;
    processingDocuments: number;
    failedDocuments: number;
    parts: number;
    feedbackTotal: number;
    feedbackAccuracy: number | null;
  };
};

type Entry = { payload: OverviewPayload; refreshedAt: number };
const cache = new LRUCache<string, Entry>({ max: 200, ttl: STALE_MS });
const refreshes = new Map<string, Promise<OverviewPayload>>();

export function invalidateAdminOverviewCache(tenantId?: string): void {
  if (tenantId) {
    cache.delete(tenantId);
    return;
  }
  cache.clear();
}

async function load(tenantId: string, tenantName: string): Promise<OverviewPayload> {
  const [users, documentCounts, parts, feedbackCounts] = await Promise.all([
    prisma.user.count({ where: { tenantId, status: 'APPROVED' } }),
    prisma.document.groupBy({
      by: ['status'],
      where: {
        tenantId,
        archivedAt: null,
        status: { in: ['COMPLETED', 'PENDING', 'PROCESSING', 'FAILED'] },
      },
      _count: { _all: true },
    }),
    prisma.part.count({ where: { active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } } }),
    prisma.searchFeedback.groupBy({
      by: ['correct'],
      where: { tenantId },
      _count: { _all: true },
    }),
  ]);

  const documentCount = (status: string): number =>
    documentCounts.find(row => row.status === status)?._count._all ?? 0;
  const activeDocuments = documentCount('COMPLETED');
  const processingDocuments = documentCount('PENDING') + documentCount('PROCESSING');
  const failedDocuments = documentCount('FAILED');

  const feedbackTotal = feedbackCounts.reduce((sum, row) => sum + row._count._all, 0);
  const feedbackCorrect = feedbackCounts.find(row => row.correct)?._count._all ?? 0;

  return {
    overview: {
      tenantName,
      users,
      activeDocuments,
      processingDocuments,
      failedDocuments,
      parts,
      feedbackTotal,
      feedbackAccuracy: feedbackTotal > 0 ? feedbackCorrect / feedbackTotal : null,
    },
  };
}

async function refresh(key: string, tenantId: string, tenantName: string): Promise<OverviewPayload> {
  const pending = refreshes.get(key);
  if (pending) return pending;
  const promise = load(tenantId, tenantName)
    .then(payload => {
      cache.set(key, { payload, refreshedAt: Date.now() });
      return payload;
    })
    .finally(() => refreshes.delete(key));
  refreshes.set(key, promise);
  return promise;
}

export class AdminOverviewController {
  async get(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const tenantId = req.user.tenantId;
    const tenantName = req.user.tenantName || 'Empresa';
    const cached = cache.get(tenantId);

    // O cache administrativo vive apenas no servidor. O browser precisa
    // revalidar autenticação em toda leitura para não reaproveitar dados de uma
    // sessão/tenant anterior após logout/login no mesmo dispositivo.
    res.set('Cache-Control', 'private, no-store');

    if (cached) {
      if (Date.now() - cached.refreshedAt <= FRESH_MS) {
        res.set('X-CogniVault-Cache', 'HIT');
      } else {
        res.set('X-CogniVault-Cache', 'STALE');
        void refresh(tenantId, tenantId, tenantName).catch(error => {
          console.warn('⚠️ Não foi possível atualizar overview administrativo em segundo plano:', error);
        });
      }
      res.json(cached.payload);
      return;
    }

    try {
      const payload = await refresh(tenantId, tenantId, tenantName);
      res.set('X-CogniVault-Cache', 'MISS');
      res.json(payload);
    } catch (error) {
      console.error('❌ Erro ao carregar visão geral administrativa:', error);
      res.status(500).json({ error: 'Não foi possível carregar os dados da visão geral.' });
    }
  }
}
