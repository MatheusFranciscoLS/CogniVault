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
        included { id formattedValue specificationDefinitions { name } }
        notIncluded { id formattedValue specificationDefinitions { name } }
        product {
          category { name }
          productDocuments {
            url
            fileFormat
            publicationTitle
            publicationType
            languages
            lastUpdated
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
          sharedFeatures {
            id
            name
            description
            image { url altText }
            video { link }
          }
        }
        additionalFeatures {
          id
          name
          description
          image { url altText }
          video { link }
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

// Query used by the Portal's SparePartDetails page. Applications are model-level
// relations; a product's primary article is not proof of every PNC/serial fit.
const SPARE_PART_DETAILS_QUERY = `
query getSparePart($siteName: String!, $sparePartId: ID!) {
  site(name: $siteName) {
    spareParts {
      byId(id: $sparePartId) {
        articleNumberFormatted
        commercialReference
        name
        articleDescription
        mainImage: mainImageData { url }
        url
        alsoUsedIn {
          ... on Machine { name { longName } }
          ... on Accessory { name { longName } }
        }
        specifications {
          grossWeight packagingHeight packagingLength packagingWidth ean length
          netWeight airFilterType batteryCellShape batteryEnergy batteryMaxVoltage
          batteryPackWeight batteryRechargeable batteryReplaceable batteryType
          batteryUsage bladeLength bladeType cellsPerBattery diameter masterPackQuantity
          nominalCapacity nominalVoltage packagingType power ratedCurrent
          useTogetherWithGrassBlades useTogetherWithGrassKnifes useTogetherWithSawBlades
          articleDescription
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
  lastUpdated: string | null;
  isLatest: boolean;
};

export type HusqvarnaOfficialSpecification = {
  group: string;
  name: string;
  value: string;
};

export type HusqvarnaOfficialVariant = {
  pnc: string;
  description: string | null;
  specifications: HusqvarnaOfficialSpecification[];
};

export type HusqvarnaOfficialFeature = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  source: 'SHARED' | 'ADDITIONAL';
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
  equipment: HusqvarnaOfficialProductEquipment | null;
  documents: HusqvarnaOfficialDocument[];
  specifications: HusqvarnaOfficialSpecification[];
  variants: HusqvarnaOfficialVariant[];
  features: HusqvarnaOfficialFeature[];
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

export type HusqvarnaOfficialEquipmentItem = {
  id: string;
  name: string;
  value: string | null;
};

export type HusqvarnaOfficialProductEquipment = {
  included: HusqvarnaOfficialEquipmentItem[];
  notIncluded: HusqvarnaOfficialEquipmentItem[];
};

export type HusqvarnaOfficialSparePartDetails = HusqvarnaOfficialSparePart & {
  specifications: Record<string, string> | null;
  fitsTo: string[];
};

type GraphqlError = { message?: string };
type GraphqlEnvelope<T> = { data?: T; errors?: GraphqlError[] };

const productCache = new LRUCache<string, HusqvarnaOfficialProductDetails>({ max: 500, ttl: 30 * 60 * 1000 });
const sparePartCache = new LRUCache<string, HusqvarnaOfficialSparePart>({ max: 2_000, ttl: 6 * 60 * 60 * 1000 });
const sparePartDetailsCache = new LRUCache<string, HusqvarnaOfficialSparePartDetails>({ max: 2_000, ttl: 6 * 60 * 60 * 1000 });

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

function safeHttpsUrl(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, PORTAL_ORIGIN);
    return url.protocol === 'https:' ? url.toString() : null;
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

function dateTimestamp(value: string | null): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
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

export function parseOfficialProductEquipment(article: { included?: unknown; notIncluded?: unknown }): HusqvarnaOfficialProductEquipment | null {
  if (!Array.isArray(article.included) && !Array.isArray(article.notIncluded)) return null;
  const parseItems = (raw: unknown): HusqvarnaOfficialEquipmentItem[] => {
    if (!Array.isArray(raw)) return [];
    const items = new Map<string, HusqvarnaOfficialEquipmentItem>();
    for (const item of raw) {
      const id = typeof item?.id === 'string' ? item.id.trim() : '';
      const name = typeof item?.specificationDefinitions?.name === 'string' ? item.specificationDefinitions.name.trim() : '';
      const value = typeof item?.formattedValue === 'string' ? item.formattedValue.trim() : '';
      if (!id || !name || items.has(id)) continue;
      items.set(id, { id, name, value: !value || /^[-–—]+$/.test(value) ? null : value });
    }
    return [...items.values()];
  };
  const included = parseItems(article.included);
  const notIncluded = parseItems(article.notIncluded);
  const includedIds = new Set(included.map(item => item.id));
  const conflicts = new Set(notIncluded.filter(item => includedIds.has(item.id)).map(item => item.id));
  return {
    included: included.filter(item => !conflicts.has(item.id)),
    notIncluded: notIncluded.filter(item => !conflicts.has(item.id)),
  };
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

  const specificationDefinitions = new Map<string, { group: string; name: string }>();
  for (const group of article.product?.specifications?.specificationGroups || []) {
    const groupName = String(group?.name || 'Especificações').trim() || 'Especificações';
    for (const specification of group?.specifications || []) {
      const id = String(specification?.id || '').trim();
      if (!id) continue;
      specificationDefinitions.set(id, {
        group: groupName,
        name: String(specification?.name || id).trim(),
      });
    }
  }

  const mapSpecificationValues = (values: any[]): HusqvarnaOfficialSpecification[] => {
    const mapped: HusqvarnaOfficialSpecification[] = [];
    for (const rawValue of Array.isArray(values) ? values : []) {
      const id = String(rawValue?.id || '').trim();
      const value = String(rawValue?.formattedValue || '').trim();
      const definition = specificationDefinitions.get(id);
      if (!id || !value || !definition) continue;
      mapped.push({ group: definition.group, name: definition.name, value });
    }
    return mapped;
  };

  const specifications = mapSpecificationValues(article.specificationValues || []);

  const variants: HusqvarnaOfficialVariant[] = (article.product?.articles || [])
    .map((item: any) => ({
      pnc: normalizeIdentifier(String(item?.id || '')),
      description: item?.articleDescription ? String(item.articleDescription).trim() : null,
      specifications: mapSpecificationValues(item?.specificationValues || []),
    }))
    .filter((item: HusqvarnaOfficialVariant) => /^\d{8,14}$/.test(item.pnc));

  const rawDocuments: Array<Omit<HusqvarnaOfficialDocument, 'isLatest'>> = (article.product?.productDocuments || [])
    .map((document: any) => ({
      title: String(document?.publicationTitle || 'Documento Husqvarna').trim(),
      type: String(document?.publicationType || 'OTHER').trim().toUpperCase(),
      languages: Array.isArray(document?.languages) ? document.languages.map((language: unknown) => String(language).toUpperCase()) : [],
      fileFormat: document?.fileFormat ? String(document.fileFormat) : null,
      url: safePortalUrl(document?.url) || '',
      lastUpdated: document?.lastUpdated ? String(document.lastUpdated) : null,
    }))
    .filter((document: Omit<HusqvarnaOfficialDocument, 'isLatest'>) => Boolean(document.url));

  const latestByType = new Map<string, number>();
  for (const document of rawDocuments) {
    const timestamp = dateTimestamp(document.lastUpdated);
    if (!timestamp) continue;
    latestByType.set(document.type, Math.max(latestByType.get(document.type) || 0, timestamp));
  }

  const documents: HusqvarnaOfficialDocument[] = rawDocuments
    .map(document => ({
      ...document,
      isLatest: Boolean(dateTimestamp(document.lastUpdated) && dateTimestamp(document.lastUpdated) === latestByType.get(document.type)),
    }))
    .sort((left, right) => {
      const leftPt = left.languages.includes('PT') ? 0 : 1;
      const rightPt = right.languages.includes('PT') ? 0 : 1;
      if (leftPt !== rightPt) return leftPt - rightPt;
      const typeOrder = (type: string) => type === 'OM' ? 0 : type === 'IPL' ? 1 : 2;
      const typeDifference = typeOrder(left.type) - typeOrder(right.type);
      if (typeDifference !== 0) return typeDifference;
      const dateDifference = dateTimestamp(right.lastUpdated) - dateTimestamp(left.lastUpdated);
      return dateDifference || left.title.localeCompare(right.title, 'pt-BR');
    });

  const featureMap = new Map<string, HusqvarnaOfficialFeature>();
  const addFeatures = (items: any[], source: HusqvarnaOfficialFeature['source']) => {
    for (const item of Array.isArray(items) ? items : []) {
      const name = String(item?.name || '').trim();
      if (!name) continue;
      const id = String(item?.id || name).trim();
      const key = id || name.toLocaleLowerCase('pt-BR');
      const feature: HusqvarnaOfficialFeature = {
        id,
        name,
        description: item?.description ? String(item.description).trim() : null,
        imageUrl: officialMediaUrl(item?.image?.url),
        videoUrl: safeHttpsUrl(item?.video?.link),
        source,
      };
      if (!featureMap.has(key) || source === 'ADDITIONAL') featureMap.set(key, feature);
    }
  };
  addFeatures(article.product?.sharedFeatures || [], 'SHARED');
  addFeatures(article.additionalFeatures || [], 'ADDITIONAL');
  const features = [...featureMap.values()];

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
    equipment: parseOfficialProductEquipment(article),
    documents,
    specifications,
    variants,
    features,
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

export function parseOfficialSparePartDetails(payload: unknown, partNumberInput: string): HusqvarnaOfficialSparePartDetails | null {
  const partNumber = normalizeIdentifier(partNumberInput);
  if (!/^\d{6,14}$/.test(partNumber)) return null;
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
  const item = record(record(record(record(payload).site).spareParts).byId);
  // Do not accept a search neighbour, replacement, or unrelated hydrated object.
  if (normalizeIdentifier(text(item.articleNumberFormatted)) !== partNumber) return null;

  const specifications = Object.fromEntries(Object.entries(record(item.specifications))
    .flatMap(([key, value]) => {
      const formatted = text(value);
      return formatted ? [[key, formatted]] : [];
    }));
  const name = text(item.name);
  if (!name) return null;
  const related = Array.isArray(item.alsoUsedIn) ? item.alsoUsedIn : [];
  const fitsTo = [...new Set(related.flatMap(usage => {
    const name = text(record(record(usage).name).longName);
    return name ? [name.replace(/\s+/g, ' ')] : [];
  }))];

  return {
    partNumber,
    name,
    description: text(item.articleDescription) || specifications.articleDescription || null,
    commercialReference: text(item.commercialReference),
    url: safePortalUrl(item.url),
    imageUrl: officialMediaUrl(record(item.mainImage).url),
    specifications: Object.keys(specifications).length ? specifications : null,
    fitsTo,
  };
}

export class HusqvarnaOfficialDetailService {
  static async getSparePartDetails(partNumberInput: string): Promise<HusqvarnaOfficialSparePartDetails | null> {
    const partNumber = normalizeIdentifier(partNumberInput);
    if (!/^\d{6,14}$/.test(partNumber)) return null;
    const cached = sparePartDetailsCache.get(partNumber);
    if (cached) return cached;

    const data = await postGraphql<unknown>('getSparePart', SPARE_PART_DETAILS_QUERY, {
      siteName: SITE,
      sparePartId: partNumber,
    });
    const result = parseOfficialSparePartDetails(data, partNumber);
    if (result) sparePartDetailsCache.set(partNumber, result);
    return result;
  }

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
