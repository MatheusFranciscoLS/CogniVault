/**
 * Sugestões a partir do que a loja JÁ orçou no conserto (2026-10-09, plano 2.24): ao digitar uma descrição, o balcão vê as linhas parecidas que já
 * foram orçadas, com o valor de referência e o prazo mais comum; depois de lançar uma peça, vê o que costuma ir junto. Tudo é calculado das próprias
 * linhas de orçamentos de conserto arquivados (os 12 mil itens importados e os que o balcão arquivar): nenhuma fonte externa, nenhum custo.
 *
 * Funções PURAS (sem banco): recebem as linhas e devolvem índice e respostas, para ficarem fáceis de testar com casos difíceis.
 */

export interface HistoryLine {
  quoteId: string;
  /** Data do orçamento (ms): manda a ordem de "mais recente". */
  savedAt: number;
  name: string;
  partNumber: string | null;
  unitPrice: number;
  leadTime: string | null;
  isService: boolean;
}

export interface HistorySuggestion {
  name: string;
  partNumber: string | null;
  /** Em quantos orçamentos a linha apareceu. */
  count: number;
  /** Valor de referência: mediana das últimas ocorrências (o preço de 2019 não vale mais). `null` sem nenhum valor. */
  price: number | null;
  leadTime: string | null;
  isService: boolean;
}

export interface TogetherSuggestion extends HistorySuggestion {
  /** De cada 100 orçamentos que levaram a peça, quantos levaram esta também (0 a 100). */
  percent: number;
}

interface Group {
  key: string;
  spellings: Map<string, number>;
  codes: Map<string, number>;
  /** Mais recente primeiro. */
  recent: Array<{ savedAt: number; price: number; leadTime: string | null }>;
  quotes: Set<string>;
  services: number;
  total: number;
}

export interface HistoryIndex {
  groups: Map<string, Group>;
  /** Orçamento -> chaves das linhas dele. */
  byQuote: Map<string, Set<string>>;
}

const STOP_WORDS = new Set(['DE', 'DO', 'DA', 'DOS', 'DAS']);
export const RECENT_WINDOW = 10;
const MAX_NAME = 80;

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** "FILTRO DE GASOLINA", "Filtro gasolina" e "filtro  de gasolina (0,3)" são a mesma linha: chave sem acento, sem "de/do/da" e sem a quantidade quebrada. */
export function historyKey(name: string): string | null {
  const cleaned = fold(String(name ?? '')).replace(/\(\s*\d+(?:[.,]\d+)?\s*\)\s*$/, ' ').replace(/[^A-Z0-9]+/g, ' ').trim();
  if (!cleaned || cleaned.length > MAX_NAME) return null;
  const words = cleaned.split(' ').filter(word => !STOP_WORDS.has(word));
  return words.length ? words.join(' ') : null;
}

const codeKey = (code: string) => fold(code).replace(/[^A-Z0-9]/g, '');

/** Caixa alta de planilha vira frase ("FILTRO GASOLINA" -> "Filtro gasolina"); palavra com número (20W50, sigla de modelo) fica como está. */
export function displayName(raw: string): string {
  const text = String(raw).replace(/\s+/g, ' ').trim().replace(/\s*\(\d+(?:[.,]\d+)?\)\s*$/, '');
  const letters = text.replace(/[^A-Za-zÀ-ú]/g, '');
  if (letters.length < 3 || letters !== letters.toUpperCase()) return text;
  const lower = text.split(' ').map(word => (/\d/.test(word) ? word : word.toLowerCase())).join(' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const isLabor = (name: string) => /m[aã]o.?de.?obra/i.test(name);

export function buildHistoryIndex(lines: readonly HistoryLine[]): HistoryIndex {
  const groups = new Map<string, Group>();
  const byQuote = new Map<string, Set<string>>();
  for (const line of lines) {
    const key = historyKey(line.name);
    if (!key) continue;
    let group = groups.get(key);
    if (!group) {
      group = { key, spellings: new Map(), codes: new Map(), recent: [], quotes: new Set(), services: 0, total: 0 };
      groups.set(key, group);
    }
    const spelling = displayName(line.name);
    group.spellings.set(spelling, (group.spellings.get(spelling) ?? 0) + 1);
    // "SRV-1" é o código que o sistema dá a linha SEM código (serviço ou item avulso): não é código de peça e nunca vira sugestão.
    if (line.partNumber && !/^SRV-/i.test(line.partNumber.trim()) && codeKey(line.partNumber).length >= 3) group.codes.set(line.partNumber.trim(), (group.codes.get(line.partNumber.trim()) ?? 0) + 1);
    group.total += 1;
    if (line.isService || isLabor(line.name)) group.services += 1;
    group.quotes.add(line.quoteId);
    if (Number.isFinite(line.unitPrice) && line.unitPrice > 0) group.recent.push({ savedAt: line.savedAt, price: line.unitPrice, leadTime: line.leadTime?.trim() || null });
    let inQuote = byQuote.get(line.quoteId);
    if (!inQuote) { inQuote = new Set(); byQuote.set(line.quoteId, inQuote); }
    inQuote.add(key);
  }
  for (const group of groups.values()) group.recent.sort((a, b) => b.savedAt - a.savedAt);
  return { groups, byQuote };
}

const top = <T>(counts: Map<T, number>): T | null => {
  let best: T | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) if (count > bestCount) { best = value; bestCount = count; }
  return best;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(value * 100) / 100;
}

function describe(group: Group, preferCode?: string): HistorySuggestion {
  const window = group.recent.slice(0, RECENT_WINDOW);
  const isService = group.services * 2 >= group.total;
  const leads = new Map<string, number>();
  for (const item of window) if (item.leadTime) leads.set(item.leadTime, (leads.get(item.leadTime) ?? 0) + 1);
  return {
    name: top(group.spellings) ?? group.key,
    partNumber: preferCode ? top(new Map([...group.codes].filter(([code]) => codeKey(code).startsWith(preferCode)))) ?? top(group.codes) : top(group.codes),
    count: group.quotes.size,
    price: window.length ? median(window.map(item => item.price)) : null,
    // Mão de obra não tem prazo de peça.
    leadTime: isService ? null : top(leads),
    isService,
  };
}

const tokens = (text: string) => fold(text).replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

/**
 * Linhas já orçadas que casam com o que o balcão digitou. Casa por começo de palavra ("filtro gas" acha "Filtro gasolina"; "carb" acha "Carburador")
 * ou, se o texto parece um código, pelo começo do código. Linha que só apareceu uma vez não é sugestão (é ruído), a menos que seja exatamente o digitado.
 */
export function suggestFromHistory(index: HistoryIndex, query: string, limit = 8): HistorySuggestion[] {
  const raw = String(query ?? '').slice(0, 120);
  const queryTokens = tokens(raw).filter(token => !STOP_WORDS.has(token));
  const asCode = /\d/.test(raw) && !/\s/.test(raw.trim()) ? codeKey(raw) : '';
  if (!queryTokens.length || (queryTokens.join('').length < 2 && asCode.length < 3)) return [];
  const wanted = queryTokens.join(' ');
  const scored: Array<{ score: number; count: number; hits: number; group: Group }> = [];
  for (const group of index.groups.values()) {
    let score = -1;
    let hits = 0;
    if (group.key === wanted) score = 0;
    else if (asCode.length >= 3 && (hits = [...group.codes].reduce((sum, [code, n]) => sum + (codeKey(code).startsWith(asCode) ? n : 0), 0)) > 0) score = 1;
    else {
      const words = group.key.split(' ');
      if (queryTokens.every(token => words.some(word => word.startsWith(token)))) score = group.key.startsWith(wanted) ? 1 : 2;
    }
    if (score < 0) continue;
    if (group.quotes.size < 2 && score !== 0) continue;
    scored.push({ score, count: group.quotes.size, hits, group });
  }
  // Pelo código, manda quem mais vezes TEM aquele código (não quem mais aparece no geral).
  scored.sort((a, b) => a.score - b.score || b.hits - a.hits || b.count - a.count || a.group.key.localeCompare(b.group.key));
  return scored.slice(0, Math.max(1, Math.min(20, limit))).map(item => describe(item.group, asCode.length >= 3 ? asCode : undefined));
}

/**
 * O que costuma ir junto com uma linha: das OS que levaram `name`, as outras linhas (peças, não serviço) que aparecem em ao menos 15% delas e em
 * ao menos 3. `exclude` são as linhas que o orçamento aberto já tem. Com menos de 5 OS de base, não há conclusão e a lista vem vazia.
 */
export function togetherFromHistory(index: HistoryIndex, name: string, exclude: readonly string[] = [], limit = 5): TogetherSuggestion[] {
  const base = historyKey(name);
  const group = base ? index.groups.get(base) : undefined;
  if (!base || !group || group.quotes.size < 5) return [];
  const skip = new Set([base, ...exclude.map(item => historyKey(item)).filter((item): item is string => !!item)]);
  const counts = new Map<string, number>();
  for (const quoteId of group.quotes) {
    for (const key of index.byQuote.get(quoteId) ?? []) if (!skip.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: TogetherSuggestion[] = [];
  for (const [key, count] of counts) {
    const other = index.groups.get(key);
    if (!other || count < 3) continue;
    const percent = Math.round((count / group.quotes.size) * 100);
    if (percent < 15) continue;
    const info = describe(other);
    if (info.isService) continue;
    out.push({ ...info, percent });
  }
  out.sort((a, b) => b.percent - a.percent || b.count - a.count || a.name.localeCompare(b.name));
  return out.slice(0, Math.max(1, Math.min(10, limit)));
}
