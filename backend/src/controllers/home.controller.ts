import { Response } from 'express';
import { LRUCache } from 'lru-cache';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const HOME_FRESH_MS = Math.max(10_000, Number(process.env.HOME_CACHE_FRESH_MS || '30000') || 30_000);
const HOME_STALE_MS = Math.max(HOME_FRESH_MS, Number(process.env.HOME_CACHE_STALE_MS || '300000') || 300_000);

type HomePayload = {
  home: {
    counts: { parts: number; documents: number };
    recentSearches: unknown[];
    favorites: unknown[];
    recentDocuments: unknown[];
  };
};

type HomeCacheEntry = {
  payload: HomePayload;
  refreshedAt: number;
};

const homeCache = new LRUCache<string, HomeCacheEntry>({
  max: 500,
  ttl: HOME_STALE_MS,
});

const refreshes = new Map<string, Promise<HomePayload>>();

function cacheHeaders(res: Response, status: 'HIT' | 'MISS' | 'STALE'): void {
  res.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60');
  res.set('X-CogniVault-Cache', status);
}

async function loadHome(tenantId: string, userId: string): Promise<HomePayload> {
  const [parts, documents, docs, recentSearches, favorites] = await Promise.all([
    prisma.part.count({
      where: {
        active: true,
        document: { tenantId, archivedAt: null, status: 'COMPLETED' },
      },
    }),
    prisma.document.count({ where: { tenantId, archivedAt: null, status: 'COMPLETED' } }),
    prisma.document.findMany({
      where: { tenantId, archivedAt: null, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        filename: true,
        manufacturer: true,
        model: true,
        pnc: true,
        createdAt: true,
        _count: { select: { parts: { where: { active: true } } } },
      },
    }),
    prisma.searchHistory.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    prisma.favorite.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
  ]);

  return {
    home: {
      counts: { parts, documents },
      recentSearches,
      favorites,
      recentDocuments: docs.map(({ _count, ...item }) => ({
        ...item,
        partCount: _count.parts,
      })),
    },
  };
}

async function refreshHome(cacheKey: string, tenantId: string, userId: string): Promise<HomePayload> {
  const existing = refreshes.get(cacheKey);
  if (existing) return existing;

  const refresh = loadHome(tenantId, userId)
    .then((payload) => {
      homeCache.set(cacheKey, { payload, refreshedAt: Date.now() });
      return payload;
    })
    .finally(() => {
      refreshes.delete(cacheKey);
    });

  refreshes.set(cacheKey, refresh);
  return refresh;
}

export function invalidateHomeResponseCache(tenantId?: string, userId?: string): void {
  if (!tenantId) {
    homeCache.clear();
    return;
  }

  for (const key of homeCache.keys()) {
    if (!key.startsWith(`${tenantId}:`)) continue;
    if (!userId || key === `${tenantId}:${userId}`) homeCache.delete(key);
  }
}

export class HomeController {
  async home(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const { tenantId, id: userId } = req.user;
    const cacheKey = `${tenantId}:${userId}`;
    const cached = homeCache.get(cacheKey);

    if (cached) {
      const age = Date.now() - cached.refreshedAt;
      if (age <= HOME_FRESH_MS) {
        cacheHeaders(res, 'HIT');
        res.json(cached.payload);
        return;
      }

      cacheHeaders(res, 'STALE');
      res.json(cached.payload);
      void refreshHome(cacheKey, tenantId, userId).catch((error) => {
        console.warn('⚠️ Não foi possível atualizar o painel em segundo plano:', error);
      });
      return;
    }

    try {
      const payload = await refreshHome(cacheKey, tenantId, userId);
      cacheHeaders(res, 'MISS');
      res.json(payload);
    } catch (error) {
      console.error('❌ Erro na consulta do painel inicial:', error);
      res.status(500).json({ error: 'Não foi possível carregar as informações do painel inicial.' });
    }
  }
}
