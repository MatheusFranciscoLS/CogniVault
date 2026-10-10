import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { RepairHistoryService } from '../services/repair-history.service';

const one = (value: unknown): string => (typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : '');

/** Sugestões do conserto a partir do que já foi orçado. Qualquer usuário logado lê (a pasta de conserto já é da loja inteira). Nunca lança: sem histórico, lista vazia. */
export class RepairHistoryController {
  async suggest(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const query = one(req.query.q).slice(0, 120);
    let items: Awaited<ReturnType<typeof RepairHistoryService.suggest>> = [];
    try { items = await RepairHistoryService.suggest(req.user.tenantId, query); } catch (error) { console.warn('[Histórico do conserto] sugestão indisponível:', error instanceof Error ? error.message : error); }
    res.set('Cache-Control', 'private, no-cache').json({ items });
  }

  async together(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const name = one(req.query.name).slice(0, 120);
    const exclude = one(req.query.exclude).split('|').map(item => item.slice(0, 120)).filter(Boolean).slice(0, 60);
    let items: Awaited<ReturnType<typeof RepairHistoryService.together>> = [];
    try { items = await RepairHistoryService.together(req.user.tenantId, name, exclude); } catch (error) { console.warn('[Histórico do conserto] "costuma levar junto" indisponível:', error instanceof Error ? error.message : error); }
    res.set('Cache-Control', 'private, no-cache').json({ items });
  }
}

/** Painel do dono (Negócio): o que mais se orça no conserto, para guiar o estoque. Só administrador. */
export class RepairTopController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const raw = one(req.query.months);
    const months = raw === 'all' || raw === '' ? null : Math.min(120, Math.max(1, Math.floor(Number(raw)) || 12));
    const limit = Math.floor(Number(one(req.query.limit))) || 20;
    let result: Awaited<ReturnType<typeof RepairHistoryService.top>> = { totalOrders: 0, items: [] };
    try { result = await RepairHistoryService.top(req.user.tenantId, months, limit); } catch (error) { console.warn('[Histórico do conserto] "mais orçadas" indisponível:', error instanceof Error ? error.message : error); }
    res.set('Cache-Control', 'private, max-age=60').json(result);
  }
}

export const repairTopController = new RepairTopController();
export const repairHistoryController = new RepairHistoryController();
