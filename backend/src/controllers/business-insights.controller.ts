import { Response } from 'express';
import { LRUCache } from 'lru-cache';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  BusinessInsightsPayload,
  BusinessInsightsService,
  parseGranularity,
  resolveRange,
} from '../services/business-insights.service';

// O painel do dono agrega orçamento por período com JOIN em QuoteItem. Não é
// consulta de balcão: um cache curto por (tenant + janela) evita que abrir a
// aba três vezes seguidas repita o trabalho no Postgres free do Supabase.
const TTL_MS = 60_000;
const cache = new LRUCache<string, BusinessInsightsPayload>({ max: 120, ttl: TTL_MS });

export function invalidateBusinessInsightsCache(tenantId?: string): void {
  if (!tenantId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${tenantId}:`)) cache.delete(key);
  }
}

export class BusinessInsightsController {
  async get(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const tenantId = req.user.tenantId;
    const granularity = parseGranularity(req.query.granularity);
    const range = resolveRange(req.query.from, req.query.to, granularity);
    const key = `${tenantId}:${range.from.toISOString()}:${range.to.toISOString()}:${granularity}`;

    res.set('Cache-Control', 'private, no-store');

    const cached = cache.get(key);
    if (cached) {
      res.set('X-CogniVault-Cache', 'HIT');
      res.json(cached);
      return;
    }

    try {
      const payload = await BusinessInsightsService.load(tenantId, range);
      cache.set(key, payload);
      res.set('X-CogniVault-Cache', 'MISS');
      res.json(payload);
    } catch (error) {
      console.error('❌ Erro ao carregar indicadores de negócio:', error);
      res.status(500).json({ error: 'Não foi possível carregar os indicadores de negócio.' });
    }
  }
}
