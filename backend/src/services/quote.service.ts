import { Prisma, QuoteStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';

// Um orçamento de balcão real tem poucas dezenas de linhas. O teto existe para
// limitar payload e custo de gravação, não porque o balcão chegue perto dele.
export const MAX_QUOTE_ITEMS = 120;
export const MAX_SAVED_QUOTE_PAGE_SIZE = 100;

const MAX_TEXT = 300;
const MAX_NAME = 400;

/**
 * Preço de peça vem de `MasterPart.price`, que é `Float`. Somar Float acumula
 * erro (0.1 + 0.2 ≠ 0.3), e o balcão lê o total em voz alta para o cliente —
 * então todo valor passa por aqui antes de ir pro banco ou pra resposta.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export interface QuoteItemInput {
  partNumber: string;
  effectiveCode?: string | null;
  manufacturer?: string | null;
  name: string;
  model?: string | null;
  pnc?: string | null;
  section?: string | null;
  position?: string | null;
  filename?: string | null;
  page?: number | null;
  isSuperseded?: boolean;
  originalCode?: string | null;
  notes?: string | null;
  isService?: boolean;
  quantity: number;
  unitPrice?: number | null;
}

export interface QuoteOptionsInput {
  customerName?: string | null;
  customerPhone?: string | null;
  paymentMethod?: string | null;
  machineModel?: string | null;
  notes?: string | null;
  discountPercentage?: number | null;
}

export interface QuotePayload {
  id: string;
  status: QuoteStatus;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string | null;
  machineModel: string | null;
  notes: string | null;
  discountPercentage: number;
  totalItems: number;
  grossTotal: number;
  discountAmount: number;
  netTotal: number;
  createdAt: string;
  updatedAt: string;
  savedAt: string | null;
  attendantId: string | null;
  attendantEmail: string | null;
  items: Array<{
    id: string;
    partNumber: string;
    effectiveCode: string | null;
    manufacturer: string | null;
    name: string;
    model: string | null;
    pnc: string | null;
    section: string | null;
    position: string | null;
    filename: string | null;
    page: number | null;
    isSuperseded: boolean;
    originalCode: string | null;
    notes: string | null;
    isService: boolean;
    quantity: number;
    unitPrice: number | null;
  }>;
}

function text(value: unknown, maxLength = MAX_TEXT): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  if (!clean) return null;
  return clean.slice(0, maxLength);
}

/** Itens `SRV-*` são mão de obra/avulso criados na própria cesta. */
function looksLikeService(partNumber: string, explicit?: boolean): boolean {
  if (typeof explicit === 'boolean') return explicit;
  return partNumber.toUpperCase().startsWith('SRV-');
}

export function parseQuoteItems(value: unknown): QuoteItemInput[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_QUOTE_ITEMS) return null;

  const items: QuoteItemInput[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const input = raw as Record<string, unknown>;

    const partNumber = text(input.partNumber, 80);
    const name = text(input.name, MAX_NAME);
    if (!partNumber || !name) return null;

    const quantityRaw = Number(input.quantity);
    const quantity = Number.isFinite(quantityRaw) ? Math.floor(quantityRaw) : 1;
    if (quantity < 1 || quantity > 9999) return null;

    let unitPrice: number | null = null;
    if (input.unitPrice !== undefined && input.unitPrice !== null && input.unitPrice !== '') {
      const parsed = Number(input.unitPrice);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10_000_000) return null;
      unitPrice = roundMoney(parsed);
    }

    let page: number | null = null;
    if (input.page !== undefined && input.page !== null && input.page !== '') {
      const parsed = Number(input.page);
      if (!Number.isFinite(parsed) || parsed < 0) return null;
      page = Math.floor(parsed);
    }

    items.push({
      partNumber,
      effectiveCode: text(input.effectiveCode, 80),
      manufacturer: text(input.manufacturer, 80),
      name,
      model: text(input.model, 160),
      pnc: text(input.pnc, 80),
      section: text(input.section, 200),
      position: text(input.position, 80),
      filename: text(input.filename, 300),
      page,
      isSuperseded: input.isSuperseded === true,
      originalCode: text(input.originalCode, 80),
      notes: text(input.notes, 500),
      isService: looksLikeService(partNumber, typeof input.isService === 'boolean' ? input.isService : undefined),
      quantity,
      unitPrice,
    });
  }

  return items;
}

export function parseQuoteOptions(value: unknown): QuoteOptionsInput | null {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;

  let discountPercentage = 0;
  if (input.discountPercentage !== undefined && input.discountPercentage !== null && input.discountPercentage !== '') {
    const parsed = Number(input.discountPercentage);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
    discountPercentage = Math.round(parsed * 100) / 100;
  }

  return {
    customerName: text(input.customerName, 200),
    customerPhone: text(input.customerPhone, 40),
    paymentMethod: text(input.paymentMethod, 120),
    machineModel: text(input.machineModel, 160),
    notes: text(input.notes, 2000),
    discountPercentage,
  };
}

export interface QuoteTotals {
  totalItems: number;
  grossTotal: number;
  discountAmount: number;
  netTotal: number;
}

/**
 * Totais são sempre recalculados no servidor a partir de quantidade × preço.
 * O cliente nunca dita o total: um campo editável de preço na tela do balcão
 * não pode virar a fonte de verdade do que o dono lê no painel.
 */
export function computeTotals(items: QuoteItemInput[], discountPercentage: number): QuoteTotals {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const grossTotal = roundMoney(
    items.reduce((sum, item) => sum + item.quantity * (item.unitPrice ?? 0), 0),
  );
  const discountAmount = discountPercentage > 0 ? roundMoney((grossTotal * discountPercentage) / 100) : 0;
  return {
    totalItems,
    grossTotal,
    discountAmount,
    netTotal: roundMoney(grossTotal - discountAmount),
  };
}

const quoteInclude = {
  items: { orderBy: { sortOrder: 'asc' } },
  user: { select: { id: true, email: true } },
} satisfies Prisma.QuoteInclude;

type QuoteWithItems = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;

export function serializeQuote(quote: QuoteWithItems): QuotePayload {
  return {
    id: quote.id,
    status: quote.status,
    customerName: quote.customerName,
    customerPhone: quote.customerPhone,
    paymentMethod: quote.paymentMethod,
    machineModel: quote.machineModel,
    notes: quote.notes,
    discountPercentage: quote.discountPercentage,
    totalItems: quote.totalItems,
    grossTotal: quote.grossTotal,
    discountAmount: quote.discountAmount,
    netTotal: quote.netTotal,
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
    savedAt: quote.savedAt ? quote.savedAt.toISOString() : null,
    attendantId: quote.user?.id ?? null,
    attendantEmail: quote.user?.email ?? null,
    items: quote.items.map(item => ({
      id: item.id,
      partNumber: item.partNumber,
      effectiveCode: item.effectiveCode,
      manufacturer: item.manufacturer,
      name: item.name,
      model: item.model,
      pnc: item.pnc,
      section: item.section,
      position: item.position,
      filename: item.filename,
      page: item.page,
      isSuperseded: item.isSuperseded,
      originalCode: item.originalCode,
      notes: item.notes,
      isService: item.isService,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };
}

function itemRows(items: QuoteItemInput[]) {
  return items.map((item, index) => ({
    sortOrder: index,
    partNumber: item.partNumber,
    normalizedPartNumber: normalizeIdentifier(item.effectiveCode || item.partNumber),
    effectiveCode: item.effectiveCode ?? null,
    manufacturer: item.manufacturer ?? null,
    name: item.name,
    model: item.model ?? null,
    pnc: item.pnc ?? null,
    section: item.section ?? null,
    position: item.position ?? null,
    filename: item.filename ?? null,
    page: item.page ?? null,
    isSuperseded: item.isSuperseded ?? false,
    originalCode: item.originalCode ?? null,
    notes: item.notes ?? null,
    isService: item.isService ?? false,
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? null,
  }));
}

/**
 * Teto explicito das transacoes da cesta.
 *
 * **Falha real, medida em producao** (18/09/2026 21:16 UTC): o `PUT` da cesta
 * voltou 500 com *"Transaction already closed: the timeout for this transaction
 * was 5000 ms, however 6725 ms passed"*. O padrao do Prisma para transacao
 * interativa e 5 s, e ele nao foi ultrapassado por trabalho: sao tres comandos
 * (apagar itens, recriar, atualizar o cabecalho). Foi latencia -- Render free
 * falando com Supabase free, com o banco frio ou disputado.
 *
 * Todas as outras transacoes desta base ja declaram o teto
 * (`import-price-list`, `ai.service`, `semantic-index-maintenance`). As duas da
 * cesta eram as unicas no padrao, e sao justamente as do caminho critico do
 * balcao: o atendente perde a sincronia com o cliente na frente.
 *
 * 20 s e ~3x o pior tempo observado. O trabalho continua pequeno, entao isso
 * nao segura conexao do pool em operacao lenta -- so cobre a rede ruim.
 */
export const QUOTE_TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

export class QuoteService {
  /** Cesta aberta do atendente, criando uma vazia na primeira visita. */
  static async getOrCreateDraft(tenantId: string, userId: string): Promise<QuotePayload> {
    const existing = await prisma.quote.findFirst({
      where: { tenantId, userId, status: 'DRAFT' },
      include: quoteInclude,
    });
    if (existing) return serializeQuote(existing);

    try {
      const created = await prisma.quote.create({
        data: { tenantId, userId, status: 'DRAFT' },
        include: quoteInclude,
      });
      return serializeQuote(created);
    } catch (error) {
      // Corrida entre duas abas do mesmo atendente: o índice parcial único
      // `Quote_one_draft_per_user` rejeita a segunda criação, e a cesta que
      // ganhou a corrida é a resposta correta para as duas abas.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await prisma.quote.findFirst({
          where: { tenantId, userId, status: 'DRAFT' },
          include: quoteInclude,
        });
        if (raced) return serializeQuote(raced);
      }
      throw error;
    }
  }

  /**
   * Substitui a cesta inteira. O front manda o estado completo (debounced) em
   * vez de um delta por clique: com Render free e balcão em rede instável, um
   * delta perdido deixaria a cesta divergente sem ninguém perceber, enquanto um
   * PUT idempotente do estado inteiro sempre converge.
   */
  static async replaceDraft(
    tenantId: string,
    userId: string,
    items: QuoteItemInput[],
    options: QuoteOptionsInput,
  ): Promise<QuotePayload> {
    const draft = await QuoteService.getOrCreateDraft(tenantId, userId);
    const discountPercentage = options.discountPercentage ?? 0;
    const totals = computeTotals(items, discountPercentage);

    const updated = await prisma.$transaction(async tx => {
      await tx.quoteItem.deleteMany({ where: { quoteId: draft.id } });
      if (items.length) {
        await tx.quoteItem.createMany({
          data: itemRows(items).map(row => ({ ...row, quoteId: draft.id })),
        });
      }
      return tx.quote.update({
        where: { id: draft.id },
        data: {
          customerName: options.customerName ?? null,
          customerPhone: options.customerPhone ?? null,
          paymentMethod: options.paymentMethod ?? null,
          machineModel: options.machineModel ?? null,
          notes: options.notes ?? null,
          discountPercentage,
          ...totals,
        },
        include: quoteInclude,
      });
    }, QUOTE_TX_OPTIONS);

    return serializeQuote(updated);
  }

  static async clearDraft(tenantId: string, userId: string): Promise<QuotePayload> {
    return QuoteService.replaceDraft(tenantId, userId, [], {});
  }

  /**
   * Arquiva um orçamento. Recebe os itens explicitamente (e não "promove" o
   * rascunho) porque o balcão continua atendendo com a mesma cesta depois de
   * mandar o PDF/WhatsApp — promover apagaria a cesta debaixo do atendente.
   */
  static async saveQuote(
    tenantId: string,
    userId: string,
    items: QuoteItemInput[],
    options: QuoteOptionsInput,
  ): Promise<QuotePayload> {
    const discountPercentage = options.discountPercentage ?? 0;
    const totals = computeTotals(items, discountPercentage);
    const now = new Date();

    const created = await prisma.quote.create({
      data: {
        tenantId,
        userId,
        status: 'SAVED',
        savedAt: now,
        customerName: options.customerName ?? null,
        customerPhone: options.customerPhone ?? null,
        paymentMethod: options.paymentMethod ?? null,
        machineModel: options.machineModel ?? null,
        notes: options.notes ?? null,
        discountPercentage,
        ...totals,
        items: { create: itemRows(items) },
      },
      include: quoteInclude,
    });

    return serializeQuote(created);
  }

  static async updateSavedQuote(
    tenantId: string,
    quoteId: string,
    items: QuoteItemInput[] | null,
    options: QuoteOptionsInput,
  ): Promise<QuotePayload | null> {
    const existing = await prisma.quote.findFirst({
      where: { id: quoteId, tenantId, status: 'SAVED' },
      include: quoteInclude,
    });
    if (!existing) return null;

    const nextItems: QuoteItemInput[] = items ?? existing.items.map(item => ({
      partNumber: item.partNumber,
      effectiveCode: item.effectiveCode,
      manufacturer: item.manufacturer,
      name: item.name,
      model: item.model,
      pnc: item.pnc,
      section: item.section,
      position: item.position,
      filename: item.filename,
      page: item.page,
      isSuperseded: item.isSuperseded,
      originalCode: item.originalCode,
      notes: item.notes,
      isService: item.isService,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));

    const discountPercentage = options.discountPercentage ?? existing.discountPercentage;
    const totals = computeTotals(nextItems, discountPercentage);

    const updated = await prisma.$transaction(async tx => {
      if (items) {
        await tx.quoteItem.deleteMany({ where: { quoteId } });
        if (items.length) {
          await tx.quoteItem.createMany({
            data: itemRows(items).map(row => ({ ...row, quoteId })),
          });
        }
      }
      return tx.quote.update({
        where: { id: quoteId },
        data: {
          customerName: options.customerName ?? existing.customerName,
          customerPhone: options.customerPhone ?? existing.customerPhone,
          paymentMethod: options.paymentMethod ?? existing.paymentMethod,
          machineModel: options.machineModel ?? existing.machineModel,
          notes: options.notes ?? existing.notes,
          discountPercentage,
          ...totals,
        },
        include: quoteInclude,
      });
    }, QUOTE_TX_OPTIONS);

    return serializeQuote(updated);
  }

  static async deleteSavedQuote(tenantId: string, quoteId: string): Promise<boolean> {
    const result = await prisma.quote.deleteMany({
      where: { id: quoteId, tenantId, status: 'SAVED' },
    });
    return result.count > 0;
  }

  static async getSavedQuote(tenantId: string, quoteId: string): Promise<QuotePayload | null> {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, tenantId, status: 'SAVED' },
      include: quoteInclude,
    });
    return quote ? serializeQuote(quote) : null;
  }

  static async listSavedQuotes(params: {
    tenantId: string;
    /** Balcão só enxerga o que ele mesmo atendeu; Admin enxerga a loja toda. */
    restrictToUserId?: string | null;
    search?: string;
    from?: Date | null;
    to?: Date | null;
    take: number;
    skip: number;
  }): Promise<{ quotes: QuotePayload[]; total: number }> {
    const where: Prisma.QuoteWhereInput = {
      tenantId: params.tenantId,
      status: 'SAVED',
    };
    if (params.restrictToUserId) where.userId = params.restrictToUserId;
    if (params.from || params.to) {
      where.savedAt = {
        ...(params.from ? { gte: params.from } : {}),
        ...(params.to ? { lte: params.to } : {}),
      };
    }

    const search = (params.search || '').trim();
    if (search) {
      const normalizedCode = normalizeIdentifier(search);
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search, mode: 'insensitive' } },
        { machineModel: { contains: search, mode: 'insensitive' } },
        { items: { some: { name: { contains: search, mode: 'insensitive' } } } },
        ...(normalizedCode
          ? [{ items: { some: { normalizedPartNumber: { contains: normalizedCode } } } } as Prisma.QuoteWhereInput]
          : []),
      ];
    }

    const [quotes, total] = await Promise.all([
      prisma.quote.findMany({
        where,
        include: quoteInclude,
        orderBy: { savedAt: 'desc' },
        take: params.take,
        skip: params.skip,
      }),
      prisma.quote.count({ where }),
    ]);

    return { quotes: quotes.map(serializeQuote), total };
  }
}
