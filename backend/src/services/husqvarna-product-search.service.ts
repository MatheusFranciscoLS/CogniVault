import { LRUCache } from 'lru-cache';
import { normalizeIdentifier } from '../utils/normalize';

const GRAPHQL_URL = 'https://portal.husqvarnagroup.com/hbd/graphql?';
const PORTAL_ORIGIN = 'https://portal.husqvarnagroup.com';
const SITE = 'b2b-br-pt-br';
const TIMEOUT_MS = 8_000;

const SEARCH_QUERY = `
query searchForProducts($site: String!, $searchTerm: String!, $brands: [String!], $statuses: [String!], $skip: Int!, $take: Int!) {
  site(name: $site) {
    search {
      content(
        searchTerm: $searchTerm
        showResultsFor: MACHINES
        brands: $brands
        statuses: $statuses
        skip: $skip
        take: $take
      ) {
        results {
          resultItem {
            __typename
            ... on Machine {
              id
              sku
              url
              brand
              selectedArticle
              isDiscontinued
              numberOfVariants
              name { productName }
              mainImageData { url altText }
              primaryArticle { id commercialReference name isDiscontinued }
              category { id name url }
            }
            ... on DiamondTool {
              id
              sku
              url
              selectedArticle
              isDiscontinued
              name { productName }
              mainImageData { url altText }
              primaryArticle { id commercialReference name isDiscontinued }
              category { id name url }
            }
          }
        }
      }
    }
  }
}`;

export type HusqvarnaProductSearchResult = {
  pnc: string;
  productName: string;
  categoryName: string | null;
  portalUrl: string | null;
  imageUrl: string | null;
  discontinued: boolean;
  numberOfVariants: number | null;
};

type SearchCacheEntry = { results: HusqvarnaProductSearchResult[] };
const cache = new LRUCache<string, SearchCacheEntry>({ max: 300, ttl: 15 * 60 * 1000 });

function safePortalUrl(value: unknown, pnc: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, PORTAL_ORIGIN);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'portal.husqvarnagroup.com') return null;
    if (/\/spare-parts\/?$/i.test(url.pathname)) return null;
    url.searchParams.set('article', pnc);
    return url.toString();
  } catch {
    return null;
  }
}

function safeMediaUrl(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, PORTAL_ORIGIN);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return null;
    if (!host.endsWith('husqvarnagroup.com') && !host.endsWith('husqvarna.com') && !host.endsWith('aprimocdn.net')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeProductName(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^HUSQVARNA\b/i.test(raw) ? raw : `HUSQVARNA ${raw}`;
}

function productHits(payload: any): any[] {
  const rawResults = payload?.data?.site?.search?.content?.results;
  const containers = Array.isArray(rawResults) ? rawResults : rawResults ? [rawResults] : [];
  const hits: any[] = [];
  for (const container of containers) {
    const rawItems = container?.resultItem;
    if (Array.isArray(rawItems)) hits.push(...rawItems.filter(Boolean));
    else if (rawItems && typeof rawItems === 'object') hits.push(rawItems);
  }
  return hits;
}

export class HusqvarnaProductSearchService {
  static async search(termInput: string): Promise<HusqvarnaProductSearchResult[]> {
    const term = String(termInput || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (term.length < 2) return [];
    const cacheKey = term.toLocaleLowerCase('pt-BR');
    const cached = cache.get(cacheKey);
    if (cached) return cached.results;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(GRAPHQL_URL, {
        method: 'POST',
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
          Origin: PORTAL_ORIGIN,
          Referer: `${PORTAL_ORIGIN}/br/`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
        },
        body: JSON.stringify({
          operationName: 'searchForProducts',
          query: SEARCH_QUERY,
          variables: { site: SITE, searchTerm: term, brands: null, statuses: null, skip: 0, take: 20 },
        }),
      });
      if (!response.ok) return [];
      const payload = await response.json() as any;
      if (Array.isArray(payload?.errors) && payload.errors.length) return [];

      const dedup = new Map<string, HusqvarnaProductSearchResult>();
      for (const hit of productHits(payload)) {
        const pncCandidates = [hit?.selectedArticle, hit?.primaryArticle?.id, hit?.primaryArticle?.commercialReference]
          .map((value: unknown) => normalizeIdentifier(String(value || '')))
          .filter((value: string) => /^\d{8,14}$/.test(value));
        const pnc = pncCandidates[0] || '';
        const productName = normalizeProductName(hit?.name?.productName || hit?.primaryArticle?.name);
        if (!pnc || !productName) continue;
        const item: HusqvarnaProductSearchResult = {
          pnc,
          productName,
          categoryName: hit?.category?.name ? String(hit.category.name).trim() : null,
          portalUrl: safePortalUrl(hit?.url, pnc),
          imageUrl: safeMediaUrl(hit?.mainImageData?.url),
          discontinued: Boolean(hit?.isDiscontinued || hit?.primaryArticle?.isDiscontinued),
          numberOfVariants: Number.isFinite(Number(hit?.numberOfVariants)) ? Number(hit.numberOfVariants) : null,
        };
        dedup.set(`${item.pnc}|${item.productName}`, item);
      }
      const results = [...dedup.values()].slice(0, 20);
      cache.set(cacheKey, { results });
      return results;
    } catch (error) {
      console.warn(`[Husqvarna Search] Falha ao buscar "${term}": ${error instanceof Error ? error.message : String(error)}`);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}
