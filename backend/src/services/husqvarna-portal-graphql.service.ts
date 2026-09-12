import { normalizeIdentifier } from '../utils/normalize';

const HUSQVARNA_GRAPHQL_URL = 'https://portal.husqvarnagroup.com/hbd/graphql?';
const HUSQVARNA_PORTAL_ORIGIN = 'https://portal.husqvarnagroup.com';
const HUSQVARNA_BR_SITE = 'b2b-br-pt-br';
const GRAPHQL_TIMEOUT_MS = 8_000;

const SEARCH_PRODUCTS_QUERY = `
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
                name { productName }
                primaryArticle {
                  id
                  commercialReference
                  name
                  isDiscontinued
                }
                category { id name url }
                subCategories { id name url }
              }
              ... on DiamondTool {
                id
                sku
                url
                selectedArticle
                isDiscontinued
                name { productName }
                primaryArticle {
                  id
                  commercialReference
                  name
                  isDiscontinued
                }
                category { id name url }
                subCategories { id name url }
              }
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_DETAILS_QUERY = `
  query getProductDetailsSections($siteName: String!, $articleId: ID!) {
    site(name: $siteName) {
      articles {
        byIds(ids: [$articleId]) {
          id
          isNew
          isDiscontinued
          name { productName }
          articleDescription
          product {
            category { name }
            productDocuments {
              url
              fileFormat
              publicationTitle
              publicationType
              languages
            }
          }
          iplDocuments {
            documentId
            publicationTitle
            url
          }
          ipls {
            id
            name
            image
            referenceHeight
            referenceWidth
          }
        }
      }
    }
  }
`;

type GraphqlCategory = {
  id?: string | null;
  name?: string | null;
  url?: string | null;
};

type GraphqlProductHit = {
  __typename?: string | null;
  id?: string | null;
  sku?: string | null;
  url?: string | null;
  brand?: string | null;
  selectedArticle?: string | null;
  isDiscontinued?: boolean | null;
  name?: { productName?: string | null } | null;
  primaryArticle?: {
    id?: string | null;
    commercialReference?: string | null;
    name?: string | null;
    isDiscontinued?: boolean | null;
  } | null;
  category?: GraphqlCategory | null;
  subCategories?: GraphqlCategory[] | null;
};

type GraphqlSearchResponse = {
  data?: {
    site?: {
      search?: {
        content?: {
          results?: Array<{ resultItem?: GraphqlProductHit | null }> | null;
        } | null;
      } | null;
    } | null;
  } | null;
  errors?: Array<{ message?: string }>;
};

type GraphqlProductDocument = {
  url?: string | null;
  fileFormat?: string | null;
  publicationTitle?: string | null;
  publicationType?: string | null;
  languages?: string[] | null;
};

type GraphqlIplDocument = {
  documentId?: string | null;
  publicationTitle?: string | null;
  url?: string | null;
};

type GraphqlIplSummary = {
  id?: string | null;
  name?: string | null;
  image?: string | null;
  referenceHeight?: string | null;
  referenceWidth?: string | null;
};

type GraphqlArticleDetails = {
  id?: string | null;
  isNew?: boolean | null;
  isDiscontinued?: boolean | null;
  name?: { productName?: string | null } | null;
  articleDescription?: string | null;
  product?: {
    category?: { name?: string | null } | null;
    productDocuments?: GraphqlProductDocument[] | null;
  } | null;
  iplDocuments?: GraphqlIplDocument[] | null;
  ipls?: GraphqlIplSummary[] | null;
};

type GraphqlProductDetailsResponse = {
  data?: {
    site?: {
      articles?: {
        byIds?: Array<GraphqlArticleDetails | null> | null;
      } | null;
    } | null;
  } | null;
  errors?: Array<{ message?: string }>;
};

export type HusqvarnaPortalProductMatch = {
  pnc: string;
  productName: string;
  portalUrl: string;
  discontinued: boolean;
  productId: string | null;
  selectedArticle: string | null;
  sku: string | null;
  category: { id: string | null; name: string | null; url: string | null } | null;
};

export type HusqvarnaIplSectionSummary = {
  id: string;
  name: string;
  imageUrl: string | null;
  referenceHeight: string | null;
  referenceWidth: string | null;
};

export type HusqvarnaProductDetailsSummary = {
  pnc: string;
  productName: string;
  discontinued: boolean;
  articleDescription: string | null;
  categoryName: string | null;
  iplSections: HusqvarnaIplSectionSummary[];
  productDocumentCount: number;
  iplDocumentCount: number;
};

export type HusqvarnaVerifiedProductIdentity = {
  productName: string;
  categoryName?: string | null;
};

function normalizeCandidate(value: unknown): string {
  return normalizeIdentifier(String(value || ''));
}

function normalizeProductName(value: unknown): string {
  const productName = String(value || '').trim();
  if (!productName) return '';
  return /^HUSQVARNA\b/i.test(productName) ? productName : `HUSQVARNA ${productName}`;
}

function exactPncEvidence(hit: GraphqlProductHit, pnc: string): boolean {
  return [
    hit.selectedArticle,
    hit.sku,
    hit.primaryArticle?.id,
    hit.primaryArticle?.commercialReference,
  ]
    .map(normalizeCandidate)
    .filter(Boolean)
    .includes(pnc);
}

function canonicalProductUrl(rawUrl: string | null | undefined, pnc: string): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl, HUSQVARNA_PORTAL_ORIGIN);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'portal.husqvarnagroup.com') return null;
    if (/\/spare-parts\/?$/i.test(url.pathname)) return null;
    url.searchParams.set('article', pnc);
    return url.toString();
  } catch {
    return null;
  }
}

function toProductMatch(hit: GraphqlProductHit, pnc: string): HusqvarnaPortalProductMatch | null {
  const portalUrl = canonicalProductUrl(hit.url, pnc);
  const productName = normalizeProductName(hit.name?.productName || hit.primaryArticle?.name);
  if (!portalUrl || !productName) return null;

  return {
    pnc,
    productName,
    portalUrl,
    discontinued: Boolean(hit.isDiscontinued || hit.primaryArticle?.isDiscontinued),
    productId: hit.id || null,
    selectedArticle: hit.selectedArticle || null,
    sku: hit.sku || null,
    category: hit.category
      ? {
          id: hit.category.id || null,
          name: hit.category.name || null,
          url: hit.category.url || null,
        }
      : null,
  };
}

export function extractExactProductMatch(payload: unknown, pncInput: string): HusqvarnaPortalProductMatch | null {
  const pnc = normalizeIdentifier(pncInput);
  if (!pnc || !payload || typeof payload !== 'object') return null;

  const response = payload as GraphqlSearchResponse;
  const results = response.data?.site?.search?.content?.results || [];

  for (const entry of results) {
    const hit = entry?.resultItem;
    if (!hit || !exactPncEvidence(hit, pnc)) continue;
    const match = toProductMatch(hit, pnc);
    if (match) return match;
  }

  return null;
}

export function extractVerifiedProductMatch(
  payload: unknown,
  pncInput: string,
  verified: HusqvarnaVerifiedProductIdentity,
): HusqvarnaPortalProductMatch | null {
  const pnc = normalizeIdentifier(pncInput);
  const expectedName = normalizeCandidate(normalizeProductName(verified.productName));
  const expectedCategory = normalizeCandidate(verified.categoryName || '');
  if (!pnc || !expectedName || !payload || typeof payload !== 'object') return null;

  const response = payload as GraphqlSearchResponse;
  const results = response.data?.site?.search?.content?.results || [];
  const matches = new Map<string, HusqvarnaPortalProductMatch>();

  for (const entry of results) {
    const hit = entry?.resultItem;
    if (!hit) continue;

    const candidateName = normalizeCandidate(normalizeProductName(hit.name?.productName || hit.primaryArticle?.name));
    if (!candidateName || candidateName !== expectedName) continue;

    if (expectedCategory) {
      const candidateCategory = normalizeCandidate(hit.category?.name || '');
      if (!candidateCategory || candidateCategory !== expectedCategory) continue;
    }

    const match = toProductMatch(hit, pnc);
    if (!match) continue;
    matches.set(match.portalUrl, match);
  }

  return matches.size === 1 ? [...matches.values()][0] : null;
}

export function extractProductDetailsSummary(payload: unknown, pncInput: string): HusqvarnaProductDetailsSummary | null {
  const pnc = normalizeIdentifier(pncInput);
  if (!pnc || !payload || typeof payload !== 'object') return null;

  const response = payload as GraphqlProductDetailsResponse;
  const articles = response.data?.site?.articles?.byIds || [];
  const article = articles.find(candidate => normalizeCandidate(candidate?.id) === pnc) || null;
  if (!article) return null;

  const productName = normalizeProductName(article.name?.productName);
  if (!productName) return null;

  const iplSections = (article.ipls || [])
    .map(section => ({
      id: String(section?.id || '').trim(),
      name: String(section?.name || '').trim(),
      imageUrl: section?.image ? String(section.image) : null,
      referenceHeight: section?.referenceHeight ? String(section.referenceHeight) : null,
      referenceWidth: section?.referenceWidth ? String(section.referenceWidth) : null,
    }))
    .filter(section => /^HVA_PL-[A-Za-z0-9_-]+$/i.test(section.id) && Boolean(section.name));

  return {
    pnc,
    productName,
    discontinued: Boolean(article.isDiscontinued),
    articleDescription: article.articleDescription ? String(article.articleDescription).trim() : null,
    categoryName: article.product?.category?.name ? String(article.product.category.name).trim() : null,
    iplSections,
    productDocumentCount: Array.isArray(article.product?.productDocuments) ? article.product!.productDocuments!.length : 0,
    iplDocumentCount: Array.isArray(article.iplDocuments) ? article.iplDocuments.length : 0,
  };
}

async function postGraphql<T>(operationName: string, query: string, variables: Record<string, unknown>): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GRAPHQL_TIMEOUT_MS);

  try {
    const response = await fetch(HUSQVARNA_GRAPHQL_URL, {
      method: 'POST',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
        Origin: HUSQVARNA_PORTAL_ORIGIN,
        Referer: `${HUSQVARNA_PORTAL_ORIGIN}/br/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
      },
      body: JSON.stringify({ operationName, query, variables }),
    });

    if (!response.ok) {
      console.warn(`[Husqvarna GraphQL] ${operationName} retornou HTTP ${response.status}.`);
      return null;
    }

    return await response.json() as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Husqvarna GraphQL] Falha em ${operationName}: ${message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export class HusqvarnaPortalGraphqlService {
  static async searchProductByPnc(
    pncInput: string,
    verified?: HusqvarnaVerifiedProductIdentity,
  ): Promise<HusqvarnaPortalProductMatch | null> {
    const pnc = normalizeIdentifier(pncInput);
    if (!/^\d{8,14}$/.test(pnc)) return null;

    const payload = await postGraphql<GraphqlSearchResponse>('searchForProducts', SEARCH_PRODUCTS_QUERY, {
      site: HUSQVARNA_BR_SITE,
      searchTerm: pnc,
      brands: null,
      statuses: null,
      skip: 0,
      take: 5,
    });
    if (!payload) {
      console.log(`[Husqvarna GraphQL] PNC ${pnc}: busca de produto sem payload utilizável.`);
      return null;
    }

    if (payload.errors?.length) {
      console.warn(`[Husqvarna GraphQL] Busca por PNC ${pnc} retornou erro GraphQL: ${payload.errors.map(error => error.message || 'erro').join('; ')}`);
      return null;
    }

    const exactMatch = extractExactProductMatch(payload, pnc);
    if (exactMatch) {
      console.log(`[Husqvarna GraphQL] PNC ${pnc} confirmado como ${exactMatch.productName}.`);
      return exactMatch;
    }

    if (verified) {
      const verifiedMatch = extractVerifiedProductMatch(payload, pnc, verified);
      if (verifiedMatch) {
        console.log(`[Husqvarna GraphQL] PNC ${pnc}: rota canônica confirmada por produto/categoria (${verifiedMatch.productName}).`);
        return verifiedMatch;
      }
    }

    console.log(`[Husqvarna GraphQL] PNC ${pnc}: nenhum produto com correspondência segura.`);
    return null;
  }

  static async getProductDetailsByPnc(pncInput: string): Promise<HusqvarnaProductDetailsSummary | null> {
    const pnc = normalizeIdentifier(pncInput);
    if (!/^\d{8,14}$/.test(pnc)) return null;

    const payload = await postGraphql<GraphqlProductDetailsResponse>('getProductDetailsSections', PRODUCT_DETAILS_QUERY, {
      siteName: HUSQVARNA_BR_SITE,
      articleId: pnc,
    });
    if (!payload) return null;

    if (payload.errors?.length) {
      console.warn(`[Husqvarna GraphQL] Detalhes do PNC ${pnc} retornaram erro GraphQL: ${payload.errors.map(error => error.message || 'erro').join('; ')}`);
      return null;
    }

    const details = extractProductDetailsSummary(payload, pnc);
    if (details) {
      console.log(`[Husqvarna GraphQL] PNC ${pnc} confirmado nos detalhes como ${details.productName}; ${details.iplSections.length} vista(s) explodida(s).`);
    } else {
      console.log(`[Husqvarna GraphQL] PNC ${pnc}: detalhes não confirmaram o artigo exato.`);
    }
    return details;
  }
}
