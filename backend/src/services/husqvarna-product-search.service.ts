import { LRUCache } from 'lru-cache';
import { normalizeIdentifier } from '../utils/normalize';

const GRAPHQL_URL = 'https://portal.husqvarnagroup.com/hbd/graphql?';
const PORTAL_ORIGIN = 'https://portal.husqvarnagroup.com';
const SITE = 'b2b-br-pt-br';
const TIMEOUT_MS = 8_000;

const SEARCH_QUERY = `
query searchMultiple(
  $site: String!
  $searchTerm: String!
  $brands: [String!]
  $statuses: [String!]
  $take: Int!
  $skip: Int!
  $productModelId: ID
  $publicationTypes: [PublicationType!]
  $languages: [String!]
  $sort: ProductDocumentSorting
) {
  site(name: $site) {
    search {
      products: content(
        searchTerm: $searchTerm
        showResultsFor: MACHINES
        brands: $brands
        statuses: $statuses
        skip: 0
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
      accessories: content(
        searchTerm: $searchTerm
        showResultsFor: ACCESSORIES
        brands: $brands
        statuses: $statuses
        skip: 0
        take: $take
      ) {
        results {
          resultItem {
            __typename
            ... on Accessory {
              id
              sku
              url
              brand
              selectedArticle
              isDiscontinued
              numberOfVariants
              name { productName }
              mainImageData { url altText }
              primaryArticle { id commercialReference name isDiscontinued articleDescription }
              category { id name url }
            }
          }
        }
      }
      categories: content(
        searchTerm: $searchTerm
        showResultsFor: PRODUCT_CATEGORY
        skip: 0
        take: $take
      ) {
        results {
          resultItem {
            __typename
            ... on ProductCategory {
              id
              name
              url
              productCount
              divisionBadge { displayName value }
              image: studioImage { altText url }
            }
          }
        }
      }
      spareparts: spareparts(searchTerm: $searchTerm, skip: $skip, take: $take) {
        results {
          resultItem: spareparts {
            __typename
            id
            articleNumberFormatted
            commercialReference
            description
            mainImage: mainImageData { url altText }
            name
            url
          }
        }
      }
      documents: documents(
        searchTerm: $searchTerm
        productModelId: $productModelId
        skip: $skip
        take: $take
        publicationTypes: $publicationTypes
        languages: $languages
        brands: $brands
        sort: $sort
      ) {
        results {
          resultItem: documents {
            __typename
            fileFormat
            languages
            lastUpdated
            publicationTitle
            publicationType
            sizeInBytes
            url
          }
        }
      }
    }
  }
}`;

export type HusqvarnaOfficialSearchKind = 'PRODUCT' | 'ACCESSORY' | 'SPARE_PART' | 'DOCUMENT' | 'CATEGORY';

export type HusqvarnaOfficialSearchResult = {
  kind: HusqvarnaOfficialSearchKind;
  id: string;
  title: string;
  subtitle: string | null;
  pnc: string | null;
  partNumber: string | null;
  categoryName: string | null;
  portalUrl: string | null;
  imageUrl: string | null;
  discontinued: boolean;
  numberOfVariants: number | null;
  documentType: string | null;
  languages: string[];
  lastUpdated: string | null;
  productCount: number | null;
};

type SearchCacheEntry = { results: HusqvarnaOfficialSearchResult[] };
const cache = new LRUCache<string, SearchCacheEntry>({ max: 300, ttl: 15 * 60 * 1000 });

function safePortalUrl(value: unknown, pnc?: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, PORTAL_ORIGIN);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !host.endsWith('husqvarnagroup.com')) return null;
    if (pnc && host === 'portal.husqvarnagroup.com' && !/\/spare-parts\/?$/i.test(url.pathname)) {
      url.searchParams.set('article', pnc);
    }
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

function resultItems(container: unknown): any[] {
  const rawResults = (container as any)?.results;
  const resultContainers = Array.isArray(rawResults) ? rawResults : rawResults ? [rawResults] : [];
  const items: any[] = [];
  for (const result of resultContainers) {
    const rawItems = result?.resultItem;
    if (Array.isArray(rawItems)) items.push(...rawItems.filter(Boolean));
    else if (rawItems && typeof rawItems === 'object') items.push(rawItems);
  }
  return items;
}

function pncFromHit(hit: any): string | null {
  const candidates = [hit?.selectedArticle, hit?.primaryArticle?.id, hit?.primaryArticle?.commercialReference]
    .map((value: unknown) => normalizeIdentifier(String(value || '')))
    .filter((value: string) => /^\d{8,14}$/.test(value));
  return candidates[0] || null;
}

function numericPartNumber(hit: any): string | null {
  const candidates = [hit?.articleNumberFormatted, hit?.commercialReference, hit?.id]
    .map((value: unknown) => normalizeIdentifier(String(value || '')))
    .filter((value: string) => /^\d{6,14}$/.test(value));
  return candidates[0] || null;
}

export function parseHusqvarnaSearchPayload(payload: unknown): HusqvarnaOfficialSearchResult[] {
  const search = (payload as any)?.data?.site?.search;
  if (!search) return [];
  const dedup = new Map<string, HusqvarnaOfficialSearchResult>();

  const add = (item: HusqvarnaOfficialSearchResult) => {
    const key = `${item.kind}|${item.id || item.pnc || item.partNumber || item.portalUrl || item.title}`;
    if (!dedup.has(key)) dedup.set(key, item);
  };

  for (const hit of resultItems(search.products)) {
    const pnc = pncFromHit(hit);
    const title = normalizeProductName(hit?.name?.productName || hit?.primaryArticle?.name);
    if (!pnc || !title) continue;
    add({
      kind: 'PRODUCT',
      id: String(hit?.id || pnc),
      title,
      subtitle: hit?.primaryArticle?.name && hit.primaryArticle.name !== title ? String(hit.primaryArticle.name) : null,
      pnc,
      partNumber: null,
      categoryName: hit?.category?.name ? String(hit.category.name).trim() : null,
      portalUrl: safePortalUrl(hit?.url, pnc),
      imageUrl: safeMediaUrl(hit?.mainImageData?.url),
      discontinued: Boolean(hit?.isDiscontinued || hit?.primaryArticle?.isDiscontinued),
      numberOfVariants: Number.isFinite(Number(hit?.numberOfVariants)) ? Number(hit.numberOfVariants) : null,
      documentType: null,
      languages: [],
      lastUpdated: null,
      productCount: null,
    });
  }

  for (const hit of resultItems(search.accessories)) {
    const pnc = pncFromHit(hit);
    const title = normalizeProductName(hit?.name?.productName || hit?.primaryArticle?.name || hit?.primaryArticle?.articleDescription);
    if (!title) continue;
    add({
      kind: 'ACCESSORY',
      id: String(hit?.id || pnc || title),
      title,
      subtitle: hit?.primaryArticle?.articleDescription ? String(hit.primaryArticle.articleDescription).trim() : null,
      pnc,
      partNumber: null,
      categoryName: hit?.category?.name ? String(hit.category.name).trim() : null,
      portalUrl: safePortalUrl(hit?.url, pnc),
      imageUrl: safeMediaUrl(hit?.mainImageData?.url),
      discontinued: Boolean(hit?.isDiscontinued || hit?.primaryArticle?.isDiscontinued),
      numberOfVariants: Number.isFinite(Number(hit?.numberOfVariants)) ? Number(hit.numberOfVariants) : null,
      documentType: null,
      languages: [],
      lastUpdated: null,
      productCount: null,
    });
  }

  for (const hit of resultItems(search.spareparts)) {
    const partNumber = numericPartNumber(hit);
    if (!partNumber) continue;
    const title = String(hit?.name || hit?.description || partNumber).trim();
    add({
      kind: 'SPARE_PART',
      id: partNumber,
      title,
      subtitle: hit?.description && String(hit.description).trim() !== title ? String(hit.description).trim() : null,
      pnc: null,
      partNumber,
      categoryName: null,
      portalUrl: safePortalUrl(hit?.url),
      imageUrl: safeMediaUrl(hit?.mainImage?.url),
      discontinued: false,
      numberOfVariants: null,
      documentType: null,
      languages: [],
      lastUpdated: null,
      productCount: null,
    });
  }

  for (const hit of resultItems(search.documents)) {
    const url = safePortalUrl(hit?.url);
    if (!url) continue;
    const title = String(hit?.publicationTitle || 'Documento Husqvarna').trim();
    add({
      kind: 'DOCUMENT',
      id: url,
      title,
      subtitle: hit?.fileFormat ? String(hit.fileFormat).toUpperCase() : null,
      pnc: null,
      partNumber: null,
      categoryName: null,
      portalUrl: url,
      imageUrl: null,
      discontinued: false,
      numberOfVariants: null,
      documentType: hit?.publicationType ? String(hit.publicationType).trim().toUpperCase() : null,
      languages: Array.isArray(hit?.languages) ? hit.languages.map((value: unknown) => String(value).toUpperCase()) : [],
      lastUpdated: hit?.lastUpdated ? String(hit.lastUpdated) : null,
      productCount: null,
    });
  }

  for (const hit of resultItems(search.categories)) {
    const title = String(hit?.name || '').trim();
    const url = safePortalUrl(hit?.url);
    if (!title || !url) continue;
    add({
      kind: 'CATEGORY',
      id: String(hit?.id || url),
      title,
      subtitle: hit?.divisionBadge?.displayName ? String(hit.divisionBadge.displayName).trim() : null,
      pnc: null,
      partNumber: null,
      categoryName: title,
      portalUrl: url,
      imageUrl: safeMediaUrl(hit?.image?.url),
      discontinued: false,
      numberOfVariants: null,
      documentType: null,
      languages: [],
      lastUpdated: null,
      productCount: Number.isFinite(Number(hit?.productCount)) ? Number(hit.productCount) : null,
    });
  }

  const kindOrder: Record<HusqvarnaOfficialSearchKind, number> = {
    PRODUCT: 0,
    SPARE_PART: 1,
    ACCESSORY: 2,
    DOCUMENT: 3,
    CATEGORY: 4,
  };

  return [...dedup.values()]
    .sort((left, right) => kindOrder[left.kind] - kindOrder[right.kind] || left.title.localeCompare(right.title, 'pt-BR'))
    .slice(0, 60);
}

export class HusqvarnaProductSearchService {
  static async search(termInput: string): Promise<HusqvarnaOfficialSearchResult[]> {
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
          operationName: 'searchMultiple',
          query: SEARCH_QUERY,
          variables: {
            site: SITE,
            searchTerm: term,
            brands: null,
            statuses: null,
            skip: 0,
            take: 12,
            productModelId: null,
            publicationTypes: [],
            languages: null,
            sort: null,
          },
        }),
      });
      if (!response.ok) return [];
      const payload = await response.json() as any;
      if (Array.isArray(payload?.errors) && payload.errors.length) {
        console.warn(`[Husqvarna Search] searchMultiple retornou erros: ${payload.errors.map((error: any) => error?.message || 'erro').join('; ')}`);
        return [];
      }

      const results = parseHusqvarnaSearchPayload(payload);
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
