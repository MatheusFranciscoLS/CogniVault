import { LRUCache } from 'lru-cache';
import { normalizeIdentifier } from '../utils/normalize';

const GRAPHQL_URL = 'https://portal.husqvarnagroup.com/hbd/graphql?';
const PORTAL_ORIGIN = 'https://portal.husqvarnagroup.com';
const SITE = 'b2b-br-pt-br';
const TIMEOUT_MS = 8_000;

const PRODUCT_DETAILS_QUERY = `
query getProductDetailsSections($siteName: String!, $articleId: ID!) {
  site(name: $siteName) {
    articles {
      byIds(ids: [$articleId]) {
        id
        isNew
        isDiscontinued
        articleDescription
        name { productName }
        specificationValues { id formattedValue }
        product {
          category { name }
          productDocuments {
            url
            fileFormat
            publicationTitle
            publicationType
            languages
          }
          specifications {
            specificationGroups {
              id
              name
              specifications { id name }
            }
          }
          articles {
            id
            articleDescription
            specificationValues { id formattedValue }
          }
        }
        relatedAccessories(skip: 0, take: 50) {
          result {
            __typename
            id
            articleDescription
            isDiscontinued
            isNew
            name { shortName }
            mainImage: mainImageData { url altText }
            product {
              url
              type
              category { id name mainHeading cardTitle }
              subCategories { id name mainHeading cardTitle }
            }
          }
        }
        alsoUsedIn {
          ... on Accessory {
            __typename
            id
            primaryArticle { articleNumberFormatted commercialReference }
            name { shortName }
            category { name }
            url
            isDiscontinued
            isNew
            mainImage: mainImageData { url altText }
          }
          ... on DiamondTool {
            __typename
            id
            primaryArticle { articleNumberFormatted commercialReference }
            name { shortName }
            category { name }
            url
            isDiscontinued
            isNew
            mainImage: mainImageData { url altText }
          }
          ... on Machine {
            __typename
            id
            primaryArticle { articleNumberFormatted commercialReference }
            name { shortName }
            category { name }
            url
            isDiscontinued
            isNew
            mainImage: mainImageData { url altText }
          }
        }
        iplDocuments { documentId publicationTitle url }
        ipls {
          id
          name
          image
          referenceHeight
          referenceWidth
          articles {
            coordinates
            quantity
            id
            name
            number
            comment
            url
            replacedIds
            commercialReference
            articleDescription
          }
        }
        spareParts {
          id
          name
          description
          articleNumberFormatted
          commercialReference
          mainImage: mainImageData { url altText }
          url
        }
      }
    }
  }
}`;

const SEARCH_SPARE_PART_QUERY = `
query searchForSpareparts($site: String!, $searchTerm: String!, $skip: Int!, $take: Int!) {
  site(name: $site) {
    search {
      content: spareparts(searchTerm: $searchTerm, skip: $skip, take: $take) {
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
    }
  }
}`;

export type HusqvarnaOfficialDocument = {
  title: string;
  type: string;
  languages: string[];
  fileFormat: string | null;
  url: string;
};

export type HusqvarnaOfficialSpecification = {
  group: string;
  name: string;
  value: string;
};

export type HusqvarnaOfficialVariant = {
  pnc: string;
  description: string | null;
};

export type HusqvarnaOfficialAccessory = {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  category: string | null;
  imageUrl: string | null;
  discontinued: boolean;
};

export type HusqvarnaOfficialUsage = {
  kind: string;
  id: string;
  pnc: string | null;
  name: string;
  category: string | null;
  url: string | null;
  imageUrl: string | null;
  discontinued: boolean;
};

export type HusqvarnaOfficialRelatedSparePart = {
  partNumber: string;
  name: string;
  description: string | null;
  commercialReference: string | null;
  url: string | null;
  imageUrl: string | null;
};

export type HusqvarnaOfficialIplPart = {
  position: string | null;
  partNumber: string | null;
  name: string;
  description: string | null;
  quantity: number | null;
  comment: string | null;
  coordinates: string | null;
  url: string | null;
  replacementPartNumbers: string[];
};

export type HusqvarnaOfficialIplSection = {
  id: string;
  name: string;
  imageUrl: string | null;
  referenceHeight: number | null;
  referenceWidth: number | null;
  parts: HusqvarnaOfficialIplPart[];
};

export type HusqvarnaOfficialProductDetails = {
  pnc: string;
  productName: string;
  categoryName: string | null;
  articleDescription: string | null;
  discontinued: boolean;
  documents: HusqvarnaOfficialDocument[];
  specifications: HusqvarnaOfficialSpecification[];
  variants: HusqvarnaOfficialVariant[];
  accessories: HusqvarnaOfficialAccessory[];
  alsoUsedIn: HusqvarnaOfficialUsage[];
  spareParts: HusqvarnaOfficialRelatedSparePart[];
  iplSections: HusqvarnaOfficialIplSection[];
};

export type HusqvarnaOfficialSparePart = {
  partNumber: string;
  name: string;
  description: string | null;
  commercialReference: string | null;
  url: string | null;
  imageUrl: string | null;
};

type GraphqlError = { message?: string };
type GraphqlEnvelope<T> = { data?: T; errors?: GraphqlError[] };

const productCache = new LRUCache<string, HusqvarnaOfficialProductDetails>({ max: 500, ttl: 30 * 60 * 1000 });
const sparePartCache = new LRUCache<string, HusqvarnaOfficialSparePart>({ max: 2_000, ttl: 6 * 60 * 60 * 1000 });

function normalizeProductName(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^HUSQVARNA\b/i.test(raw) ? raw : `HUSQVARNA ${raw}`;
}

function safePortalUrl(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, PORTAL_ORIGIN);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('husqvarnagroup.com')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function officialMediaUrl(value: unknown): string | null {
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

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function postGraphql<T>(operationName: string, query: string, variables: Record<string, unknown>): Promise<T | null> {
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
      body: JSON.stringify({ operationName, query, variables }),
    });
    if (!response.ok) {
      console.warn(`[Husqvarna Official] ${operationName} retornou HTTP ${response.status}.`);
      return null;
    }
    const payload = await response.json() as GraphqlEnvelope<T>;
    if (payload.errors?.length) {
      console.warn(`[Husqvarna Official] ${operationName}: ${payload.errors.map(error => error.message || 'erro').join('; ')}`);
      return null;
    }
    return payload.data || null;
  } catch (error) {
    console.warn(`[Husqvarna Official] ${operationName} falhou: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseOfficialProductDetails(payload: unknown, pncInput: string): HusqvarnaOfficialProductDetails | null {
  const pnc = normalizeIdentifier(pncInput);
  if (!pnc || !payload || typeof payload !== 'object') return null;
  const root = payload as any;
  const articles = root.site?.articles?.byIds;
  if (!Array.isArray(articles)) return null;
  const article = articles.find((item: any) => normalizeIdentifier(String(item?.id || '')) === pnc);
  if (!article) return null;

  const productName = normalizeProductName(article.name?.productName);
  if (!productName) return null;

  const specificationValues = new Map<string, string>();
  for (const value of Array.isArray(article.specificationValues) ? article.specificationValues : []) {
    const id = String(value?.id || '').trim();
    const formattedValue = String(value?.formattedValue || '').trim();
    if (id && formattedValue) specificationValues.set(id, formattedValue);
  }

  const specifications: HusqvarnaOfficialSpecification[] = [];
  for (const group of article.product?.specifications?.specificationGroups || []) {
    for (const specification of group?.specifications || []) {
      const id = String(specification?.id || '').trim();
      const value = specificationValues.get(id);
      if (!id || !value) continue;
      specifications.push({
        group: String(group?.name || 'Especificações').trim() || 'Especificações',
        name: String(specification?.name || id).trim(),
        value,
      });
    }
  }

  const variants: HusqvarnaOfficialVariant[] = (article.product?.articles || [])
    .map((item: any) => ({
      pnc: normalizeIdentifier(String(item?.id || '')),
      description: item?.articleDescription ? String(item.articleDescription).trim() : null,
    }))
    .filter((item: HusqvarnaOfficialVariant) => /^\d{8,14}$/.test(item.pnc));

  const documents: HusqvarnaOfficialDocument[] = (article.product?.productDocuments || [])
    .map((document: any) => ({
      title: String(document?.publicationTitle || 'Documento Husqvarna').trim(),
      type: String(document?.publicationType || 'OTHER').trim().toUpperCase(),
      languages: Array.isArray(document?.languages) ? document.languages.map((language: unknown) => String(language).toUpperCase()) : [],
      fileFormat: document?.fileFormat ? String(document.fileFormat) : null,
      url: safePortalUrl(document?.url) || '',
    }))
    .filter((document: HusqvarnaOfficialDocument) => Boolean(document.url))
    .sort((left: HusqvarnaOfficialDocument, right: HusqvarnaOfficialDocument) => {
      const leftPt = left.languages.includes('PT') ? 0 : 1;
      const rightPt = right.languages.includes('PT') ? 0 : 1;
      if (leftPt !== rightPt) return leftPt - rightPt;
      const typeOrder = (type: string) => type === 'OM' ? 0 : type === 'IPL' ? 1 : 2;
      return typeOrder(left.type) - typeOrder(right.type) || left.title.localeCompare(right.title, 'pt-BR');
    });

  const accessories: HusqvarnaOfficialAccessory[] = (article.relatedAccessories?.result || [])
    .map((item: any) => ({
      id: normalizeIdentifier(String(item?.id || '')) || String(item?.id || '').trim(),
      name: String(item?.name?.shortName || item?.articleDescription || item?.id || '').trim(),
      description: item?.articleDescription ? String(item.articleDescription).trim() : null,
      url: safePortalUrl(item?.product?.url),
      category: item?.product?.category?.name ? String(item.product.category.name).trim() : null,
      imageUrl: officialMediaUrl(item?.mainImage?.url),
      discontinued: Boolean(item?.isDiscontinued),
    }))
    .filter((item: HusqvarnaOfficialAccessory) => Boolean(item.name));

  const alsoUsedIn: HusqvarnaOfficialUsage[] = (article.alsoUsedIn || [])
    .map((item: any) => ({
      kind: String(item?.__typename || 'Product'),
      id: String(item?.id || '').trim(),
      pnc: normalizeIdentifier(String(item?.primaryArticle?.articleNumberFormatted || item?.primaryArticle?.commercialReference || '')) || null,
      name: String(item?.name?.shortName || item?.id || '').trim(),
      category: item?.category?.name ? String(item.category.name).trim() : null,
      url: safePortalUrl(item?.url),
      imageUrl: officialMediaUrl(item?.mainImage?.url),
      discontinued: Boolean(item?.isDiscontinued),
    }))
    .filter((item: HusqvarnaOfficialUsage) => Boolean(item.name));

  const spareParts: HusqvarnaOfficialRelatedSparePart[] = (article.spareParts || [])
    .map((item: any) => {
      const candidates = [item?.articleNumberFormatted, item?.commercialReference, item?.id]
        .map((value: unknown) => normalizeIdentifier(String(value || '')))
        .filter((value: string) => /^\d{6,14}$/.test(value));
      const partNumber = candidates[0] || '';
      return {
        partNumber,
        name: String(item?.name || item?.description || partNumber || 'Peça').trim(),
        description: item?.description ? String(item.description).trim() : null,
        commercialReference: item?.commercialReference ? String(item.commercialReference).trim() : null,
        url: safePortalUrl(item?.url),
        imageUrl: officialMediaUrl(item?.mainImage?.url),
      };
    })
    .filter((item: HusqvarnaOfficialRelatedSparePart) => Boolean(item.partNumber));

  const iplSections: HusqvarnaOfficialIplSection[] = (article.ipls || [])
    .map((section: any) => ({
      id: String(section?.id || '').trim(),
      name: String(section?.name || '').trim(),
      imageUrl: officialMediaUrl(section?.image),
      referenceHeight: numberOrNull(section?.referenceHeight),
      referenceWidth: numberOrNull(section?.referenceWidth),
      parts: (section?.articles || []).map((part: any) => {
        const commercialReference = normalizeIdentifier(String(part?.commercialReference || ''));
        const id = normalizeIdentifier(String(part?.id || ''));
        const partNumber = /^\d{6,14}$/.test(commercialReference) ? commercialReference : (/^\d{6,14}$/.test(id) ? id : null);
        return {
          position: part?.number != null ? String(part.number).trim() : null,
          partNumber,
          name: String(part?.name || part?.articleDescription || partNumber || 'Peça').trim(),
          description: part?.articleDescription ? String(part.articleDescription).trim() : null,
          quantity: numberOrNull(part?.quantity),
          comment: part?.comment ? String(part.comment).trim() : null,
          coordinates: part?.coordinates ? String(part.coordinates) : null,
          url: safePortalUrl(part?.url),
          replacementPartNumbers: Array.isArray(part?.replacedIds)
            ? part.replacedIds.map((value: unknown) => normalizeIdentifier(String(value || ''))).filter((value: string) => /^\d{6,14}$/.test(value))
            : [],
        } satisfies HusqvarnaOfficialIplPart;
      }),
    }))
    .filter((section: HusqvarnaOfficialIplSection) => /^HVA_PL-[A-Za-z0-9_-]+$/i.test(section.id) && Boolean(section.name));

  return {
    pnc,
    productName,
    categoryName: article.product?.category?.name ? String(article.product.category.name).trim() : null,
    articleDescription: article.articleDescription ? String(article.articleDescription).trim() : null,
    discontinued: Boolean(article.isDiscontinued),
    documents,
    specifications,
    variants,
    accessories,
    alsoUsedIn,
    spareParts,
    iplSections,
  };
}

export function parseOfficialSparePart(payload: unknown, partNumberInput: string): HusqvarnaOfficialSparePart | null {
  const partNumber = normalizeIdentifier(partNumberInput);
  if (!partNumber || !payload || typeof payload !== 'object') return null;
  const root = payload as any;
  const rawResults = root.site?.search?.content?.results;
  const containers = Array.isArray(rawResults) ? rawResults : rawResults ? [rawResults] : [];
  for (const container of containers) {
    const rawItems = container?.resultItem;
    const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
    for (const item of items) {
      const candidates = [item?.id, item?.articleNumberFormatted, item?.commercialReference]
        .map((value: unknown) => normalizeIdentifier(String(value || '')))
        .filter(Boolean);
      if (!candidates.includes(partNumber)) continue;
      return {
        partNumber,
        name: String(item?.name || item?.description || partNumber).trim(),
        description: item?.description ? String(item.description).trim() : null,
        commercialReference: item?.commercialReference ? String(item.commercialReference).trim() : null,
        url: safePortalUrl(item?.url),
        imageUrl: officialMediaUrl(item?.mainImage?.url),
      };
    }
  }
  return null;
}

export class HusqvarnaOfficialDetailService {
  static async getProductDetails(pncInput: string): Promise<HusqvarnaOfficialProductDetails | null> {
    const pnc = normalizeIdentifier(pncInput);
    if (!/^\d{8,14}$/.test(pnc)) return null;
    const cached = productCache.get(pnc);
    if (cached) return cached;

    const data = await postGraphql<any>('getProductDetailsSections', PRODUCT_DETAILS_QUERY, {
      siteName: SITE,
      articleId: pnc,
    });
    const result = parseOfficialProductDetails(data, pnc);
    if (result) productCache.set(pnc, result);
    return result;
  }

  static async searchSparePart(partNumberInput: string): Promise<HusqvarnaOfficialSparePart | null> {
    const partNumber = normalizeIdentifier(partNumberInput);
    if (!/^\d{6,14}$/.test(partNumber)) return null;
    const cached = sparePartCache.get(partNumber);
    if (cached) return cached;

    const data = await postGraphql<any>('searchForSpareparts', SEARCH_SPARE_PART_QUERY, {
      site: SITE,
      searchTerm: partNumber,
      skip: 0,
      take: 5,
    });
    const result = parseOfficialSparePart(data, partNumber);
    if (result) sparePartCache.set(partNumber, result);
    return result;
  }
}
