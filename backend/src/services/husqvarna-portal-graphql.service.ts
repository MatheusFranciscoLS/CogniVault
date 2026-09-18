import { normalizeIdentifier } from '../utils/normalize';
import { husqvarnaArticleIdCandidates } from '../utils/husqvarna-article-id';
import { safeHusqvarnaAssetUrl } from '../utils/husqvarna-url';
import { buildOfficialSourceCacheKey, OfficialSourceCacheService } from './official-source-cache.service';

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

type GraphqlSearchResultContainer = {
  resultItem?: GraphqlProductHit | GraphqlProductHit[] | null;
};

type GraphqlSearchResponse = {
  data?: {
    site?: {
      search?: {
        content?: {
          results?: GraphqlSearchResultContainer | GraphqlSearchResultContainer[] | null;
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

/**
 * Documento oficial na forma enxuta que a consulta rápida precisa: link, título
 * e formato. Sem `lastUpdated`/`isLatest` de propósito — a query desta rota não
 * pede a data, e "qual é o mais recente" é trabalho do painel completo
 * (`husqvarna-official-detail.service.ts`), que busca o conjunto inteiro.
 */
export type HusqvarnaQuickDocument = {
  title: string;
  /** `OM` = manual do operador, `IPL` = lista/vista de peças, senão o que vier. */
  type: string;
  languages: string[];
  fileFormat: string | null;
  url: string;
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
  /**
   * Os links de verdade. Antes desta versão só a *contagem* acima sobrevivia à
   * extração, e a resposta da consulta rápida mandava `documents: []` mesmo com
   * a carga já em cache — o balcão tinha que abrir o painel oficial só para
   * chegar no manual.
   */
  documents: HusqvarnaQuickDocument[];
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

function searchHits(response: GraphqlSearchResponse): GraphqlProductHit[] {
  const rawResults = response.data?.site?.search?.content?.results;
  if (!rawResults) return [];

  const containers = Array.isArray(rawResults) ? rawResults : [rawResults];
  const hits: GraphqlProductHit[] = [];

  for (const container of containers) {
    const rawItems = container?.resultItem;
    if (!rawItems) continue;

    if (Array.isArray(rawItems)) {
      for (const item of rawItems) {
        if (item && typeof item === 'object') hits.push(item);
      }
    } else if (typeof rawItems === 'object') {
      hits.push(rawItems);
    }
  }

  return hits;
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
  for (const hit of searchHits(response)) {
    if (!exactPncEvidence(hit, pnc)) continue;
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
  const matches = new Map<string, HusqvarnaPortalProductMatch>();

  for (const hit of searchHits(response)) {
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
    documents: quickDocuments(article),
  };
}

/**
 * Junta os documentos do produto com os das vistas explodidas, na ordem em que
 * o balcão quer: português primeiro, manual do operador antes da lista de
 * peças. Quem atende não quer navegar num acervo — quer o manual em PT no topo.
 */
function quickDocuments(article: GraphqlArticleDetails): HusqvarnaQuickDocument[] {
  const documents: HusqvarnaQuickDocument[] = [];

  for (const raw of article.product?.productDocuments || []) {
    const url = safeHusqvarnaAssetUrl(raw?.url);
    if (!url) continue;
    documents.push({
      title: String(raw?.publicationTitle || 'Documento Husqvarna').trim(),
      type: String(raw?.publicationType || 'OTHER').trim().toUpperCase(),
      languages: Array.isArray(raw?.languages) ? raw.languages.map(language => String(language).toUpperCase()) : [],
      fileFormat: raw?.fileFormat ? String(raw.fileFormat) : null,
      url,
    });
  }

  for (const raw of article.iplDocuments || []) {
    const url = safeHusqvarnaAssetUrl(raw?.url);
    if (!url) continue;
    documents.push({
      title: String(raw?.publicationTitle || 'Lista de peças').trim(),
      type: 'IPL',
      languages: [],
      fileFormat: null,
      url,
    });
  }

  // Um mesmo PDF pode aparecer nas duas listas; a URL é a identidade.
  const unique = [...new Map(documents.map(document => [document.url, document])).values()];

  const typeOrder = (type: string) => (type === 'OM' ? 0 : type === 'IPL' ? 1 : 2);
  return unique.sort((left, right) => {
    const leftPt = left.languages.includes('PT') ? 0 : 1;
    const rightPt = right.languages.includes('PT') ? 0 : 1;
    if (leftPt !== rightPt) return leftPt - rightPt;
    const byType = typeOrder(left.type) - typeOrder(right.type);
    return byType || left.title.localeCompare(right.title, 'pt-BR');
  });
}

async function postGraphql<T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  resourceId: string,
): Promise<T | null> {
  const key = buildOfficialSourceCacheKey('HUSQVARNA', `GRAPHQL_${operationName}`, variables);
  const result = await OfficialSourceCacheService.get<T>(
    key,
    {
      source: 'HUSQVARNA',
      resourceType: `GRAPHQL_${operationName}`,
      resourceId,
      freshMs: 6 * 60 * 60 * 1000,
    },
    async () => {
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

        const payload = await response.json() as T;
        const errors = (payload as { errors?: Array<{ message?: string }> }).errors;
        if (errors?.length) {
          console.warn(`[Husqvarna GraphQL] ${operationName} retornou erro GraphQL: ${errors.map(error => error.message || 'erro').join('; ')}`);
          return null;
        }
        return payload;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[Husqvarna GraphQL] Falha em ${operationName}: ${message}`);
        return null;
      } finally {
        clearTimeout(timeout);
      }
    },
  );

  return result.value;
}

export class HusqvarnaPortalGraphqlService {
  static async searchProductByPnc(
    pncInput: string,
    verified?: HusqvarnaVerifiedProductIdentity,
  ): Promise<HusqvarnaPortalProductMatch | null> {
    const pnc = normalizeIdentifier(pncInput);
    if (!/^\d{8,14}$/.test(pnc)) return null;

    // O portal indexa a máquina pelo artigo de 9 dígitos. Buscar pelo número
    // longo da etiqueta devolvia lista VAZIA — medido na API real:
    // searchTerm '96041044000' -> nada; '960410440' -> TS 142.
    let payload: GraphqlSearchResponse | null = null;
    let searchedId = pnc;
    for (const candidate of husqvarnaArticleIdCandidates(pnc)) {
      payload = await postGraphql<GraphqlSearchResponse>('searchForProducts', SEARCH_PRODUCTS_QUERY, {
        site: HUSQVARNA_BR_SITE,
        searchTerm: candidate,
        brands: null,
        statuses: null,
        skip: 0,
        take: 5,
      }, candidate);
      if (payload) {
        searchedId = candidate;
        break;
      }
    }
    if (!payload) {
      console.log(`[Husqvarna GraphQL] PNC ${pnc}: busca de produto sem payload utilizável.`);
      return null;
    }

    try {
      const exactMatch = extractExactProductMatch(payload, searchedId);
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Husqvarna GraphQL] PNC ${pnc}: resposta de busca em formato inesperado (${message}).`);
      return null;
    }

    console.log(`[Husqvarna GraphQL] PNC ${pnc}: nenhum produto com correspondência segura.`);
    return null;
  }

  static async getProductDetailsByPnc(pncInput: string): Promise<HusqvarnaProductDetailsSummary | null> {
    const pnc = normalizeIdentifier(pncInput);
    if (!/^\d{8,14}$/.test(pnc)) return null;

    // Mesmo motivo da busca: articleId de 11 dígitos devolve null.
    let payload: GraphqlProductDetailsResponse | null = null;
    let usedId = pnc;
    for (const candidate of husqvarnaArticleIdCandidates(pnc)) {
      payload = await postGraphql<GraphqlProductDetailsResponse>('getProductDetailsSections', PRODUCT_DETAILS_QUERY, {
        siteName: HUSQVARNA_BR_SITE,
        articleId: candidate,
      }, candidate);
      if (payload) {
        usedId = candidate;
        break;
      }
    }
    if (!payload) return null;

    const details = extractProductDetailsSummary(payload, usedId);
    if (details) {
      console.log(`[Husqvarna GraphQL] PNC ${pnc} confirmado nos detalhes como ${details.productName}; ${details.iplSections.length} vista(s) explodida(s).`);
    } else {
      console.log(`[Husqvarna GraphQL] PNC ${pnc}: detalhes não confirmaram o artigo exato.`);
    }
    return details;
  }
}
