import { prisma } from '../config/prisma';
import { buildHistoryIndex, suggestFromHistory, togetherFromHistory, type HistoryIndex, type HistorySuggestion, type TogetherSuggestion } from '../utils/repair-history';

/**
 * Sugestões do conserto a partir dos orçamentos de conserto JÁ ARQUIVADOS da loja (importados e do balcão). O índice fica em memória por loja
 * e vale 60 s: a cada tecla o balcão consulta, e reler 13 mil linhas no Supabase free a cada consulta seria o pior caso. Só leitura; nada grava.
 */
const TTL_MS = 60_000;
const MAX_LINES = 150_000;

interface Cached { at: number; index: Promise<HistoryIndex> }
const cache = new Map<string, Cached>();

async function load(tenantId: string): Promise<HistoryIndex> {
  const rows = await prisma.quoteItem.findMany({
    where: { quote: { tenantId, kind: 'REPAIR', status: 'SAVED' } },
    select: { quoteId: true, name: true, partNumber: true, unitPrice: true, leadTime: true, isService: true, quote: { select: { savedAt: true, createdAt: true } } },
    orderBy: { createdAt: 'desc' },
    take: MAX_LINES,
  });
  return buildHistoryIndex(rows.map(row => ({
    quoteId: row.quoteId,
    savedAt: (row.quote.savedAt ?? row.quote.createdAt).getTime(),
    name: row.name,
    partNumber: row.partNumber,
    unitPrice: row.unitPrice ?? 0,
    leadTime: row.leadTime,
    isService: row.isService,
  })));
}

function start(tenantId: string): Promise<HistoryIndex> {
  const index = load(tenantId);
  cache.set(tenantId, { at: Date.now(), index });
  // Falha de banco não pode ficar guardada: a próxima consulta tenta de novo.
  index.catch(() => { if (cache.get(tenantId)?.index === index) cache.delete(tenantId); });
  return index;
}

/**
 * Índice velho é usado NA HORA e atualizado por trás: reler 13 mil linhas leva ~1,5 s, e o balcão não pode esperar isso numa tecla. Só a primeira
 * consulta depois de o servidor acordar espera a carga (o balcão a dispara ao abrir a aba).
 */
async function indexFor(tenantId: string): Promise<HistoryIndex> {
  const hit = cache.get(tenantId);
  if (!hit) return start(tenantId);
  if (Date.now() - hit.at >= TTL_MS) {
    const stale = hit.index;
    // Marca já como "em atualização" (uma carga só por vez) mantendo o índice velho até o novo chegar.
    cache.set(tenantId, { at: Date.now(), index: stale });
    load(tenantId).then(fresh => cache.set(tenantId, { at: Date.now(), index: Promise.resolve(fresh) })).catch(() => { cache.set(tenantId, { at: 0, index: stale }); });
    return stale;
  }
  return hit.index;
}

export class RepairHistoryService {
  static async suggest(tenantId: string, query: string): Promise<HistorySuggestion[]> {
    return suggestFromHistory(await indexFor(tenantId), query);
  }

  static async together(tenantId: string, name: string, exclude: string[]): Promise<TogetherSuggestion[]> {
    return togetherFromHistory(await indexFor(tenantId), name, exclude);
  }

  /** Para os testes: esquece o índice guardado. */
  static forget(tenantId?: string): void {
    if (tenantId) cache.delete(tenantId); else cache.clear();
  }
}
