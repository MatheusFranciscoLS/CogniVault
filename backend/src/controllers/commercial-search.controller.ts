import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { LRUCache } from 'lru-cache';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';

type CommercialSection = {
  name: string;
  count: number;
};

const MAX_COMMERCIAL_QUERY_LENGTH = 200;
const MAX_COMMERCIAL_SECTION_LENGTH = 160;

const sectionCache = new LRUCache<string, CommercialSection[]>({
  max: 200,
  ttl: 5 * 60 * 1000,
});

function scoreCommercialPart(
  query: string,
  item: {
    normalizedNumber: string;
    name: string;
    description: string | null;
    brand: string | null;
    sections: Array<{
      application: string | null;
      reference: string | null;
      productCategory: string | null;
      section: string;
    }>;
  },
): number {
  const normalizedCode = normalizeIdentifier(query);
  const normalizedQuery = normalizeText(query);
  const tokens = normalizedQuery.split(/\s+/).filter(token => token.length >= 2);

  let score = 0;
  if (normalizedCode && item.normalizedNumber === normalizedCode) score += 2000;
  else if (normalizedCode && item.normalizedNumber.startsWith(normalizedCode)) score += 900;
  else if (normalizedCode && item.normalizedNumber.includes(normalizedCode)) score += 500;

  const name = normalizeText(item.name);
  const description = normalizeText(item.description || '');
  const sectionText = normalizeText(item.sections.map(section => [
    section.application,
    section.reference,
    section.productCategory,
    section.section,
  ].filter(Boolean).join(' ')).join(' '));
  const haystack = `${name} ${description} ${sectionText}`;

  if (normalizedQuery && name === normalizedQuery) score += 800;
  else if (normalizedQuery && name.includes(normalizedQuery)) score += 500;
  if (normalizedQuery && sectionText.includes(normalizedQuery)) score += 450;
  const appears = (token: string) => wordForms(token).some(form => haystack.includes(form));
  if (tokens.length && tokens.every(appears)) score += 350;
  score += tokens.filter(appears).length * 35;

  return score;
}

function serializeCommercialPart(
  item: {
    id: string;
    partNumber: string;
    normalizedNumber: string;
    name: string;
    description: string | null;
    price: number | null;
    ean: string | null;
    ncm: string | null;
    category: string | null;
    brand: string | null;
    sections: Array<{
      application: string | null;
      reference: string | null;
      productCategory: string | null;
      section: string;
    }>;
  },
  score: number,
) {
  return {
    id: item.id,
    partNumber: item.partNumber,
    normalizedNumber: item.normalizedNumber,
    name: item.name,
    application: item.sections.map(section => section.application).find(Boolean) || item.description || item.brand,
    applications: [...new Set(item.sections.map(section => section.application).filter((value): value is string => Boolean(value)))],
    price: item.price,
    ean: item.ean,
    ncm: item.ncm,
    classCode: item.category,
    priceSections: [...new Set(item.sections.map(section => section.section))],
    references: [...new Set(item.sections.map(section => section.reference).filter((value): value is string => Boolean(value)))],
    productCategories: [...new Set(item.sections.map(section => section.productCategory).filter((value): value is string => Boolean(value)))],
    score,
    source: 'PRICE_LIST' as const,
  };
}

type SerializedCommercialPart = ReturnType<typeof serializeCommercialPart>;
type CommercialSearchPath = 'EXACT_CODE' | 'CODE_PREFIX' | 'FULL_TEXT';
type CommercialSearchPayload = {
  parts: SerializedCommercialPart[];
  sections: CommercialSection[];
};
type CachedCommercialSearch = {
  payload: CommercialSearchPayload;
  path: CommercialSearchPath;
};

const searchResponseCache = new LRUCache<string, CachedCommercialSearch>({
  max: 2000,
  ttl: 2 * 60 * 1000,
});

const inFlightSearches = new Map<string, Promise<CachedCommercialSearch>>();

/**
 * Só ativa o caminho curto para entradas com forte aparência de código de peça.
 * Modelos como MZ54/K770 continuam na pesquisa textual e por aplicação.
 */
export function looksLikeCommercialCodePrefix(value: string): boolean {
  const normalized = normalizeIdentifier(value);
  if (normalized.length < 5 || normalized.length > 20) return false;
  const digits = (normalized.match(/\d/g) || []).length;
  return digits >= 5 && digits / normalized.length >= 0.7;
}

/**
 * Só pesquisa normalizedNumber no fallback amplo quando a entrada realmente
 * se parece com um código. Termos descritivos como "filtro" não devem adicionar
 * LIKE '%FILTRO%' ao campo de código, porque isso impede um plano barato para a
 * pesquisa textual e não acrescenta resultado comercial útil.
 */
export function shouldSearchCommercialPartNumber(value: string): boolean {
  return looksLikeCommercialCodePrefix(value);
}

/**
 * Converte um prefixo ASCII normalizado em um limite superior exclusivo.
 * Ex.: 58710 -> 58711. Usar gte/lt permite que o PostgreSQL aproveite o
 * índice btree composto (tenantId, normalizedNumber), ao contrário de LIKE 'x%'
 * na collation atual do banco.
 */
export function commercialCodePrefixUpperBound(value: string): string {
  const normalized = normalizeIdentifier(value);
  if (!normalized) return '\uffff';
  const lastIndex = normalized.length - 1;
  const nextChar = String.fromCharCode(normalized.charCodeAt(lastIndex) + 1);
  return `${normalized.slice(0, lastIndex)}${nextChar}`;
}

async function availableSections(tenantId: string): Promise<CommercialSection[]> {
  const cached = sectionCache.get(tenantId);
  if (cached) return cached;

  const rows = await prisma.masterPartSection.groupBy({
    by: ['section'],
    where: { tenantId },
    _count: { _all: true },
    orderBy: { section: 'asc' },
  });
  const sections = rows.map(section => ({ name: section.section, count: section._count._all }));
  sectionCache.set(tenantId, sections);
  return sections;
}


const SEARCH_STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'com', 'e', 'o', 'a', 'um', 'uma', 'no', 'na']);
const MAX_SEARCH_TOKENS = 6;

/**
 * Palavras que o balcão fala e a LISTA escreve de outro jeito. Só entra o que foi medido na lista da Husqvarna
 * (loja simulada, 22 mil códigos), onde a busca devolvia zero:
 *
 * - "fio de nylon": a lista escreve **NAILON** ("CARRETEL PARA FIO DE NAILON"). Nylon, nilon e nailon são a mesma palavra.
 * - "bomba primer": a bombinha de partida a frio é "BOMBA MANUAL DO CARBURADOR" na lista; ninguém ali escreve "primer".
 *
 * Cada entrada ACRESCENTA formas para procurar; a forma digitada continua valendo. Vale também na pontuação.
 */
const WORD_ALTERNATIVES: Record<string, string[]> = {
  nylon: ['nilon', 'nailon'],
  nilon: ['nylon', 'nailon'],
  nailon: ['nylon', 'nilon'],
  primer: ['bomba manual'],
};

/** Formas pelas quais uma palavra pode aparecer na lista (a própria e as equivalentes). */
export function wordForms(plain: string): string[] {
  return [plain, ...(WORD_ALTERNATIVES[plain] ?? [])];
}

/** Cada palavra útil da pergunta, na forma digitada e sem acento (sem repetir). */
export function commercialSearchWords(query: string): Array<{ plain: string; variants: string[] }> {
  const seen = new Set<string>();
  const words: Array<{ plain: string; variants: string[] }> = [];
  for (const raw of query.trim().split(/\s+/)) {
    const plain = normalizeText(raw);
    if (plain.length < 2 || SEARCH_STOPWORDS.has(plain) || seen.has(plain)) continue;
    seen.add(plain);
    words.push({ plain, variants: [...new Set([raw.toLowerCase(), ...wordForms(plain)])] });
    if (words.length === MAX_SEARCH_TOKENS) break;
  }
  return words;
}

/** Palavras da pergunta, sem acento, sem "de/da/para…" e sem repetir. Máximo de 6. */
export function commercialSearchTokens(query: string): string[] {
  const tokens = normalizeText(query)
    .split(/\s+/)
    .filter(token => token.length >= 2 && !SEARCH_STOPWORDS.has(token));
  return [...new Set(tokens)].slice(0, MAX_SEARCH_TOKENS);
}

/**
 * Candidatos do cadastro de preços por TEXTO.
 *
 * Duas falhas reais, vistas com a lista de preços da Husqvarna: (1) a lista vem SEM
 * acento ("VELA DE IGNICAO"), e o Prisma compara `contains` sem ignorar acento, então
 * "vela de ignição" devolvia ZERO; (2) a frase tinha que aparecer colada, então
 * "filtro ar roçadeira" não achava nada. Agora a frase é tentada com e sem acento, e
 * pergunta de várias palavras também aceita a peça que tenha TODAS as palavras, em
 * qualquer ordem e em qualquer campo.
 */
export function buildCommercialTextFilters(query: string): Prisma.MasterPartWhereInput[] {
  const fieldsFor = (term: string): Prisma.MasterPartWhereInput[] => [
    { name: { contains: term, mode: 'insensitive' } },
    { description: { contains: term, mode: 'insensitive' } },
    { brand: { contains: term, mode: 'insensitive' } },
    {
      sections: {
        some: {
          OR: [
            { application: { contains: term, mode: 'insensitive' } },
            { reference: { contains: term, mode: 'insensitive' } },
            { productCategory: { contains: term, mode: 'insensitive' } },
          ],
        },
      },
    },
  ];

  const phrases = [...new Set([query.trim(), normalizeText(query)].filter(Boolean))];
  const filters = phrases.flatMap(fieldsFor);

  // Cada palavra nas DUAS formas: a lista de preços vem sem acento ("IGNICAO"), mas as categorias
  // vêm com ("ROÇADEIRA"), então só uma das formas deixaria um dos dois casos de fora.
  const words = commercialSearchWords(query);
  if (words.length >= 2) filters.push({ AND: words.map(word => ({ OR: word.variants.flatMap(fieldsFor) })) });
  // Uma palavra só: as equivalentes ("primer" → "bomba manual") não estão na frase digitada.
  if (words.length === 1) filters.push(...words[0].variants.filter(form => !phrases.includes(form)).flatMap(fieldsFor));
  return filters;
}

async function loadCommercialSearch(
  tenantId: string,
  query: string,
  selectedSection: string,
): Promise<CachedCommercialSearch> {
  const normalizedCode = normalizeIdentifier(query);
  const sectionsPromise = availableSections(tenantId);

  if (normalizedCode.length >= 4) {
    const exact = await prisma.masterPart.findUnique({
      where: { tenantId_normalizedNumber: { tenantId, normalizedNumber: normalizedCode } },
      include: { sections: { orderBy: { section: 'asc' } } },
    });

    if (exact && (!selectedSection || exact.sections.some(section => section.section === selectedSection))) {
      return {
        path: 'EXACT_CODE',
        payload: { parts: [serializeCommercialPart(exact, 3000)], sections: await sectionsPromise },
      };
    }
  }

  if (looksLikeCommercialCodePrefix(query)) {
    const prefixRows = await prisma.masterPart.findMany({
      where: {
        tenantId,
        normalizedNumber: {
          gte: normalizedCode,
          lt: commercialCodePrefixUpperBound(normalizedCode),
        },
        ...(selectedSection ? { sections: { some: { section: selectedSection } } } : {}),
      },
      include: { sections: { orderBy: { section: 'asc' } } },
      orderBy: { normalizedNumber: 'asc' },
      take: 50,
    });

    if (prefixRows.length) {
      return {
        path: 'CODE_PREFIX',
        payload: {
          parts: prefixRows.map(item => serializeCommercialPart(item, 2200 + scoreCommercialPart(query, item))),
          sections: await sectionsPromise,
        },
      };
    }
  }

  const orFilters = buildCommercialTextFilters(query);

  if (normalizedCode.length >= 2 && shouldSearchCommercialPartNumber(query)) {
    orFilters.unshift({ normalizedNumber: { contains: normalizedCode } });
  }

  const candidates = await prisma.masterPart.findMany({
    where: {
      tenantId,
      ...(selectedSection ? { sections: { some: { section: selectedSection } } } : {}),
      OR: orFilters,
    },
    include: { sections: { orderBy: { section: 'asc' } } },
    take: 180,
  });

  const parts = candidates
    .map(item => ({ item, score: scoreCommercialPart(query, item) }))
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'pt-BR'))
    .slice(0, 50)
    .map(({ item, score }) => serializeCommercialPart(item, score));

  return {
    path: 'FULL_TEXT',
    payload: { parts, sections: await sectionsPromise },
  };
}

export class CommercialSearchController {
  async search(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const query = String(req.query.q || '').trim();
    const selectedSection = String(req.query.section || '').trim();

    if (query.length < 2) {
      res.json({ parts: [], sections: [] });
      return;
    }
    if (query.length > MAX_COMMERCIAL_QUERY_LENGTH || selectedSection.length > MAX_COMMERCIAL_SECTION_LENGTH) {
      res.status(400).json({ error: 'Consulta comercial inválida ou muito longa.', parts: [], sections: [] });
      return;
    }

    const tenantId = req.user.tenantId;
    const cacheKey = `${tenantId}:${normalizeText(selectedSection)}:${normalizeText(query)}:${normalizeIdentifier(query)}`;
    const cached = searchResponseCache.get(cacheKey);

    if (cached) {
      res.set('X-CogniVault-Cache', 'HIT');
      res.set('X-CogniVault-Search-Path', cached.path);
      // O resultado continua em cache no processo Node, mas o browser não deve
      // reutilizar dados de outro tenant/perfil após logout/login (mesmo risco
      // e mesma correção do catalog-list, PR #156).
      res.set('Cache-Control', 'private, no-store');
      res.json(cached.payload);
      return;
    }

    try {
      let pending = inFlightSearches.get(cacheKey);
      if (!pending) {
        pending = loadCommercialSearch(tenantId, query, selectedSection)
          .then(result => {
            searchResponseCache.set(cacheKey, result);
            return result;
          })
          .finally(() => {
            inFlightSearches.delete(cacheKey);
          });
        inFlightSearches.set(cacheKey, pending);
      }

      const result = await pending;
      res.set('X-CogniVault-Cache', 'MISS');
      res.set('X-CogniVault-Search-Path', result.path);
      res.set('Cache-Control', 'private, no-store');
      res.json(result.payload);
    } catch (error) {
      console.error('❌ Erro ao pesquisar cadastro comercial:', error);
      res.status(500).json({ error: 'Não foi possível pesquisar o cadastro comercial.', parts: [], sections: [] });
    }
  }
}
