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
  if (tokens.length && tokens.every(token => haystack.includes(token))) score += 350;
  score += tokens.filter(token => haystack.includes(token)).length * 35;

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

export function invalidateCommercialSearchCache(tenantId?: string): void {
  if (!tenantId) {
    sectionCache.clear();
    searchResponseCache.clear();
    return;
  }

  sectionCache.delete(tenantId);
  for (const key of searchResponseCache.keys()) {
    if (key.startsWith(`${tenantId}:`)) searchResponseCache.delete(key);
  }
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

async function loadCommercialSearch(
  tenantId: string,
  query: string,
  selectedSection: string,
): Promise<CachedCommercialSearch> {
  const normalizedCode = normalizeIdentifier(query);
  const sectionsPromise = availableSections(tenantId);

  // Código completo: índice UNIQUE (tenantId, normalizedNumber).
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

  // Digitação parcial de Part Number: evita abrir OR de nome/descrição/aplicação
  // quando a intenção é claramente completar um código.
  if (looksLikeCommercialCodePrefix(query)) {
    const prefixRows = await prisma.masterPart.findMany({
      where: {
        tenantId,
        normalizedNumber: { startsWith: normalizedCode },
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

  const orFilters: Prisma.MasterPartWhereInput[] = [
    { name: { contains: query, mode: 'insensitive' } },
    { description: { contains: query, mode: 'insensitive' } },
    { brand: { contains: query, mode: 'insensitive' } },
    {
      sections: {
        some: {
          OR: [
            { application: { contains: query, mode: 'insensitive' } },
            { reference: { contains: query, mode: 'insensitive' } },
            { productCategory: { contains: query, mode: 'insensitive' } },
          ],
        },
      },
    },
  ];

  if (normalizedCode.length >= 2) {
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

    const tenantId = req.user.tenantId;
    const cacheKey = `${tenantId}:${normalizeText(selectedSection)}:${normalizeText(query)}:${normalizeIdentifier(query)}`;
    const cached = searchResponseCache.get(cacheKey);

    if (cached) {
      res.set('X-CogniVault-Cache', 'HIT');
      res.set('X-CogniVault-Search-Path', cached.path);
      res.set('Cache-Control', 'private, max-age=20');
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
      res.set('Cache-Control', 'private, max-age=20');
      res.json(result.payload);
    } catch (error) {
      console.error('❌ Erro ao pesquisar cadastro comercial:', error);
      res.status(500).json({ error: 'Não foi possível pesquisar o cadastro comercial.', parts: [], sections: [] });
    }
  }
}
