import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';
import { endOfStoreDay, startOfStoreDay } from '../utils/store-day';
import {
  MAX_SAVED_QUOTE_PAGE_SIZE,
  QuoteService,
  parseQuoteItems,
  parseQuoteOptions,
} from '../services/quote.service';

export function canAccessQuote(
  role: string,
  userId: string,
  attendantId: string | null,
): boolean {
  return role === 'ADMIN' || attendantId === userId;
}

// `from`/`to` são dias comerciais da loja, não instantes do fuso do servidor.
// Ver utils/store-day.ts: sem isso, filtrar "até hoje" perdia o dia inteiro.

function parseIntParam(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export class QuoteController {
  async getDraft(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    try {
      const quote = await QuoteService.getOrCreateDraft(req.user.tenantId, req.user.id);
      res.set('Cache-Control', 'private, no-store');
      res.json({ quote });
    } catch (error) {
      console.error('❌ Erro ao carregar cesta de orçamento:', error);
      res.status(500).json({ error: 'Não foi possível carregar a cesta de orçamento.' });
    }
  }

  async putDraft(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const items = parseQuoteItems(req.body?.items);
    const options = parseQuoteOptions(req.body?.options);
    if (!items || !options) {
      res.status(400).json({ error: 'Itens ou dados do orçamento inválidos.' });
      return;
    }

    try {
      const quote = await QuoteService.replaceDraft(req.user.tenantId, req.user.id, items, options);
      res.set('Cache-Control', 'private, no-store');
      res.json({ quote });
    } catch (error) {
      console.error('❌ Erro ao salvar cesta de orçamento:', error);
      res.status(500).json({ error: 'Não foi possível salvar a cesta de orçamento.' });
    }
  }

  async clearDraft(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    try {
      const quote = await QuoteService.clearDraft(req.user.tenantId, req.user.id);
      res.set('Cache-Control', 'private, no-store');
      res.json({ quote });
    } catch (error) {
      console.error('❌ Erro ao esvaziar cesta de orçamento:', error);
      res.status(500).json({ error: 'Não foi possível esvaziar a cesta de orçamento.' });
    }
  }

  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const take = parseIntParam(req.query.take, 25, MAX_SAVED_QUOTE_PAGE_SIZE) || 25;
    const skip = parseIntParam(req.query.skip, 0, 100_000);
    const search = typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : '';

    try {
      const { quotes, total } = await QuoteService.listSavedQuotes({
        tenantId: req.user.tenantId,
        // Balcão vê o próprio atendimento; Admin vê a loja inteira. Não existe
        // terceiro papel (ver CLAUDE.md, "Papéis de usuário").
        restrictToUserId: req.user.role === 'ADMIN' ? null : req.user.id,
        search,
        from: startOfStoreDay(req.query.from),
        to: endOfStoreDay(req.query.to),
        take,
        skip,
      });
      res.set('Cache-Control', 'private, no-store');
      res.json({ quotes, total, take, skip });
    } catch (error) {
      console.error('❌ Erro ao listar orçamentos salvos:', error);
      res.status(500).json({ error: 'Não foi possível listar os orçamentos salvos.' });
    }
  }

  async get(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    try {
      const quote = await QuoteService.getSavedQuote(req.user.tenantId, String(req.params.id));
      if (!quote) {
        res.status(404).json({ error: 'Orçamento não encontrado.' });
        return;
      }
      if (!canAccessQuote(req.user.role, req.user.id, quote.attendantId)) {
        res.status(403).json({ error: 'Este orçamento pertence a outro atendente.' });
        return;
      }
      res.set('Cache-Control', 'private, no-store');
      res.json({ quote });
    } catch (error) {
      console.error('❌ Erro ao carregar orçamento salvo:', error);
      res.status(500).json({ error: 'Não foi possível carregar o orçamento.' });
    }
  }

  async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const items = parseQuoteItems(req.body?.items);
    const options = parseQuoteOptions(req.body?.options);
    if (!items || !options) {
      res.status(400).json({ error: 'Itens ou dados do orçamento inválidos.' });
      return;
    }
    if (!items.length) {
      res.status(400).json({ error: 'Não é possível salvar um orçamento sem itens.' });
      return;
    }

    try {
      const quote = await QuoteService.saveQuote(req.user.tenantId, req.user.id, items, options);
      void AuditService.record({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        action: 'QUOTE_SAVED',
        targetType: 'Quote',
        targetId: quote.id,
        metadata: { totalItems: quote.totalItems, netTotal: quote.netTotal },
      });
      res.status(201).json({ quote });
    } catch (error) {
      console.error('❌ Erro ao salvar orçamento:', error);
      res.status(500).json({ error: 'Não foi possível salvar o orçamento.' });
    }
  }

  async update(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const quoteId = String(req.params.id);
    const hasItems = req.body?.items !== undefined;
    const items = hasItems ? parseQuoteItems(req.body.items) : null;
    const options = parseQuoteOptions(req.body?.options);
    if ((hasItems && !items) || !options) {
      res.status(400).json({ error: 'Itens ou dados do orçamento inválidos.' });
      return;
    }

    try {
      const existing = await QuoteService.getSavedQuote(req.user.tenantId, quoteId);
      if (!existing) {
        res.status(404).json({ error: 'Orçamento não encontrado.' });
        return;
      }
      if (!canAccessQuote(req.user.role, req.user.id, existing.attendantId)) {
        res.status(403).json({ error: 'Este orçamento pertence a outro atendente.' });
        return;
      }

      const quote = await QuoteService.updateSavedQuote(req.user.tenantId, quoteId, items, options);
      if (!quote) {
        res.status(404).json({ error: 'Orçamento não encontrado.' });
        return;
      }
      void AuditService.record({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        action: 'QUOTE_UPDATED',
        targetType: 'Quote',
        targetId: quote.id,
        metadata: { totalItems: quote.totalItems, netTotal: quote.netTotal },
      });
      res.json({ quote });
    } catch (error) {
      console.error('❌ Erro ao atualizar orçamento:', error);
      res.status(500).json({ error: 'Não foi possível atualizar o orçamento.' });
    }
  }

  async remove(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const quoteId = String(req.params.id);

    try {
      const existing = await QuoteService.getSavedQuote(req.user.tenantId, quoteId);
      if (!existing) {
        res.status(404).json({ error: 'Orçamento não encontrado.' });
        return;
      }
      if (!canAccessQuote(req.user.role, req.user.id, existing.attendantId)) {
        res.status(403).json({ error: 'Este orçamento pertence a outro atendente.' });
        return;
      }

      const removed = await QuoteService.deleteSavedQuote(req.user.tenantId, quoteId);
      if (!removed) {
        res.status(404).json({ error: 'Orçamento não encontrado.' });
        return;
      }
      void AuditService.record({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        action: 'QUOTE_DELETED',
        targetType: 'Quote',
        targetId: quoteId,
        metadata: { customerName: existing.customerName, netTotal: existing.netTotal },
      });
      res.json({ ok: true });
    } catch (error) {
      console.error('❌ Erro ao excluir orçamento:', error);
      res.status(500).json({ error: 'Não foi possível excluir o orçamento.' });
    }
  }
}
