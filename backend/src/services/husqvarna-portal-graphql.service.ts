import { normalizeIdentifier } from '../utils/normalize';

const HUSQVARNA_GRAPHQL_URL = 'https://portal.husqvarnagroup.com/hbd/graphql?';
const HUSQVARNA_PORTAL_ORIGIN = 'https://portal.husqvarnagroup.com';
const HUSQVARNA_BR_SITE = 'b2b-br-pt-br';
const GRAPHQL_TIMEOUT_MS = 8_000;

const SEARCH_PRODUCTS_QUERY = `
  query searchForProducts($site: String!, $searchTerm: String!, $skip: Int!, $take: Int!) {
    site(name: $site) {
      search {
        content(
          searchTerm: $searchTerm
          showResultsFor: MACHINES
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
          results?: Array<{
            resultItem?: GraphqlProductHit | null;
          }> | null;
        } | null;
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

function normalizeCandidate(value: unknown): string {
  return normalizeIdentifier(String(value || ''));
}

function exactPncEvidence(hit: GraphqlProductHit, pnc: string): boolean {
  const identifiers = [
    hit.selectedArticle,
    hit.sku,
    hit.primaryArticle?.id,
    hit.primaryArticle?.commercialReference,
  ]
    .map(normalizeCandidate)
    .filter(Boolean);

  return identifiers.includes(pnc);
}

function canonicalPortalUrl(rawUrl: string | null | undefined, pnc: string): string | null {
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl, HUSQVARNA_PORTAL_ORIGIN);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'portal.husqvarnagroup.com') return null;

    if (!url.searchParams.has('article')) {
      url.searchParams.set('article', pnc);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function extractExactProductMatch(payload: unknown, pncInput: string): HusqvarnaPortalProductMatch | null {
  const pnc = normalizeIdentifier(pncInput);
  if (!pnc || !payload || typeof payload !== 'object') return null;

  const response = payload as GraphqlSearchResponse;
  const results = response.data?.site?.search?.content?.results || [];

  for (const entry of results) {
    const hit = entry?.resultItem;
    if (!hit || !exactPncEvidence(hit, pnc)) continue;

    const portalUrl = canonicalPortalUrl(hit.url, pnc);
    const productName = String(hit.name?.productName || hit.primaryArticle?.name || '').trim();
    if (!portalUrl || !productName) continue;

    return {
      pnc,
      productName: /^HUSQVARNA\b/i.test(productName) ? productName : `HUSQVARNA ${productName}`,
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

  return null;
}

export class HusqvarnaPortalGraphqlService {
  static async searchProductByPnc(pncInput: string): Promise<HusqvarnaPortalProductMatch | null> {
    const pnc = normalizeIdentifier(pncInput);
    if (!/^\d{8,14}$/.test(pnc)) return null;

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
        body: JSON.stringify({
          operationName: 'searchForProducts',
          query: SEARCH_PRODUCTS_QUERY,
          variables: {
            site: HUSQVARNA_BR_SITE,
            searchTerm: pnc,
            skip: 0,
            take: 5,
          },
        }),
      });

      if (!response.ok) {
        console.warn(`[Husqvarna GraphQL] Busca por PNC ${pnc} retornou HTTP ${response.status}.`);
        return null;
      }

      const payload = await response.json() as GraphqlSearchResponse;
      if (payload.errors?.length) {
        console.warn(`[Husqvarna GraphQL] Busca por PNC ${pnc} retornou erro GraphQL: ${payload.errors.map(error => error.message || 'erro').join('; ')}`);
        return null;
      }

      const match = extractExactProductMatch(payload, pnc);
      if (match) {
        console.log(`[Husqvarna GraphQL] PNC ${pnc} confirmado como ${match.productName}.`);
      } else {
        console.log(`[Husqvarna GraphQL] PNC ${pnc}: nenhum produto com correspondência exata.`);
      }
      return match;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Husqvarna GraphQL] Falha ao consultar PNC ${pnc}: ${message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
