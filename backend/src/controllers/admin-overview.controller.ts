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
  const [users, activeDocuments, processingDocuments, failedDocuments, parts, feedbackTotal, feedbackCorrect] = await Promise.all([
    prisma.user.count({ where: { tenantId, status: 'APPROVED' } }),
    prisma.document.count({ where: { tenantId, archivedAt: null, status: 'COMPLETED' } }),
    prisma.document.count({ where: { tenantId, archivedAt: null, status: { in: ['PENDING', 'PROCESSING'] } } }),
    prisma.document.count({ where: { tenantId, archivedAt: null, status: 'FAILED' } }),
    prisma.part.count({ where: { active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } } }),
    prisma.searchFeedback.count({ where: { tenantId } }),
    prisma.searchFeedback.count({ where: { tenantId, correct: true } }),
  ]);

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

    if (cached) {
      if (Date.now() - cached.refreshedAt <= FRESH_MS) {
        res.set('X-CogniVault-Cache', 'HIT');
      } else {
        res.set('X-CogniVault-Cache', 'STALE');
        void refresh(tenantId, tenantId, tenantName).catch(error => {
          console.warn('⚠️ Não foi possível atualizar overview administrativo em segundo plano:', error);
        });
      }
      res.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60');
      res.json(cached.payload);
      return;
    }

    try {
      const payload = await refresh(tenantId, tenantId, tenantName);
      res.set('X-CogniVault-Cache', 'MISS');
      res.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60');
      res.json(payload);
    } catch (error) {
      console.error('❌ Erro ao carregar visão geral administrativa:', error);
      res.status(500).json({ error: 'Não foi possível carregar os dados da visão geral.' });
    }
  }
}
