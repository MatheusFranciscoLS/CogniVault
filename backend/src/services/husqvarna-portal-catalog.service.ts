import { LRUCache } from 'lru-cache';
import { normalizeIdentifier } from '../utils/normalize';
import { HusqvarnaPortalGraphqlService } from './husqvarna-portal-graphql.service';

const HUSQVARNA_PORTAL_ORIGIN = 'https://portal.husqvarnagroup.com';
const HUSQVARNA_PORTAL_COUNTRY_PATH = '/br/';
const PORTAL_SUCCESS_TTL_MS = 6 * 60 * 60 * 1000;
const PORTAL_MISS_TTL_MS = 10 * 60 * 1000;

const VERIFIED_PRODUCT_ROUTES: Record<string, { productName: string; portalUrl: string }> = {
  '965195201': {
    productName: 'HUSQVARNA 327P5x',
    portalUrl: 'https://portal.husqvarnagroup.com/br/serrotes-com-cabo/327p5x/?article=965195201',
  },
};

export type HusqvarnaPortalDocumentType = 'IPL' | 'OM' | 'OTHER';

export type HusqvarnaPortalDocument = {
  title: string;
  type: HusqvarnaPortalDocumentType;
  url: string;
  date: string | null;
  language: string | null;
};

export type HusqvarnaPortalCatalogResult = {
  pnc: string;
  productName: string | null;
  discontinued: boolean;
  portalUrl: string;
  documents: HusqvarnaPortalDocument[];
};

type CatalogCacheEntry = {
  result: HusqvarnaPortalCatalogResult | null;
};

const catalogCache = new LRUCache<string, CatalogCacheEntry>({
  max: 1_000,
});

export function getVerifiedHusqvarnaPortalProduct(pncInput: string): HusqvarnaPortalCatalogResult | null {
  const pnc = normalizeIdentifier(pncInput);
  const verified = VERIFIED_PRODUCT_ROUTES[pnc];
  if (!verified) return null;

  return {
    pnc,
    productName: verified.productName,
    discontinued: false,
    portalUrl: verified.portalUrl,
    documents: [],
  };
}

function decodeHtml(value: string): string {
  return value
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripMarkup(value: string): string {
  return decodeHtml(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\[nrt]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isOfficialHusqvarnaHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'husqvarna.com'
    || host.endsWith('.husqvarna.com')
    || host === 'husqvarnagroup.com'
    || host.endsWith('.husqvarnagroup.com')
    || host === 'husqvarnagroup.net'
    || host.endsWith('.husqvarnagroup.net');
}

function officialDocumentUrl(rawUrl: string): string | null {
  const cleaned = decodeHtml(rawUrl).trim().replace(/[),.;]+$/, '');
  if (!cleaned) return null;

  try {
    const url = new URL(cleaned, HUSQVARNA_PORTAL_ORIGIN);
    if (url.protocol !== 'https:' || !isOfficialHusqvarnaHost(url.hostname)) return null;

    const value = `${url.pathname}${url.search}`.toLowerCase();
    const isPrintableIpl = value.includes('printipl=true');
    const isTechnicalDownload = value.includes('tdrdownload') && /\/(?:ipl|om)\//i.test(url.pathname);
    if (!isPrintableIpl && !isTechnicalDownload) return null;

    return url.toString();
  } catch {
    return null;
  }
}

function documentType(title: string, url: string): HusqvarnaPortalDocumentType {
  const value = `${title} ${url}`.toUpperCase();
  if (/\bIPL\b|PRINTIPL|\/IPL\//.test(value)) return 'IPL';
  if (/\bOM\b|OPERATOR|MANUAL|\/OM\//.test(value)) return 'OM';
  return 'OTHER';
}

function documentDate(title: string): string | null {
  return title.match(/\b(20\d{2}-(?:0[1-9]|1[0-2]))\b/)?.[1] || null;
}

function documentLanguage(title: string): string | null {
  const match = title.toUpperCase().match(/(?:^|[\s,·|])((?:PT|EN|ES|FR|DE|IT|NL|SV|NO|DA|FI))(?:$|[\s,·|])/);
  return match?.[1] || null;
}

function titleNear(html: string, index: number, type: HusqvarnaPortalDocumentType): string {
  const start = Math.max(0, index - 900);
  const end = Math.min(html.length, index + 900);
  const context = decodeHtml(html.slice(start, end));

  const propertyMatches = [...context.matchAll(/"(?:title|name|documentTitle|displayName|heading)"\s*:\s*"([^"\\]{3,240})"/gi)]
    .map(match => stripMarkup(match[1]))
    .filter(Boolean);
  const preferred = propertyMatches.find(value => type === 'IPL' ? /\bIPL\b/i.test(value) : type === 'OM' ? /\bOM\b|manual|operator/i.test(value) : true);
  if (preferred) return preferred;

  const text = stripMarkup(context);
  const marker = type === 'IPL' ? /\bIPL\b/i : type === 'OM' ? /\bOM\b|manual|operator/i : null;
  if (marker) {
    const match = marker.exec(text);
    if (match) {
      const from = Math.max(0, match.index - 90);
      const to = Math.min(text.length, match.index + 190);
      const candidate = text.slice(from, to).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, '').trim();
      if (candidate.length >= 3 && candidate.length <= 280) return candidate;
    }
  }

  return type === 'IPL' ? 'IPL oficial Husqvarna' : type === 'OM' ? 'Manual oficial Husqvarna' : 'Documento oficial Husqvarna';
}

function cleanProductName(value: string, pnc: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.replace(new RegExp(`\\s+${pnc}\\s*$`, 'i'), '').trim();
}

function isSpecificProductName(value: string): boolean {
  if (!/^HUSQVARNA\s+[A-Za-z0-9]/i.test(value)) return false;

  const normalized = value.replace(/\s+/g, ' ').trim().toUpperCase();
  return !/^HUSQVARNA\s+(?:PORTAL|GROUP|GLOBAL|B2B|SUPPORT|SERVICE(?:\s+HUB)?|HUB|MANUALS?|DOCUMENTS?)\b/.test(normalized);
}

function extractProductName(html: string, pnc: string): string | null {
  const decoded = decodeHtml(html);
  const pncIndex = decoded.toUpperCase().indexOf(pnc.toUpperCase());
  const regions = pncIndex >= 0
    ? [decoded.slice(Math.max(0, pncIndex - 2_000), Math.min(decoded.length, pncIndex + 2_000)), decoded]
    : [decoded];

  for (const region of regions) {
    const quoted = [...region.matchAll(/"([^"\\]{3,140})"/g)]
      .map(match => cleanProductName(stripMarkup(match[1]), pnc))
      .find(value => value.length <= 100 && isSpecificProductName(value));
    if (quoted) return quoted;

    const plain = stripMarkup(region);
    const matches = [...plain.matchAll(/\bHUSQVARNA\s+([A-Za-z0-9][A-Za-z0-9.+\-/ ]{1,55}?)(?=\s{2,}|\b(?:All|Todos|Documentos|Documents|Descontinuado|Discontinued)\b|$)/gi)];
    for (const match of matches) {
      const candidate = cleanProductName(`HUSQVARNA ${match[1].trim()}`, pnc);
      if (isSpecificProductName(candidate)) return candidate;
    }
  }

  return null;
}

function documentIdentity(urlValue: string): string {
  try {
    const url = new URL(urlValue);
    const iplId = url.searchParams.get('iplId');
    if (iplId) return `${url.origin}${url.pathname}?iplId=${iplId}`.toLowerCase();
    return `${url.origin}${url.pathname}`.toLowerCase();
  } catch {
    return urlValue.toLowerCase();
  }
}

function addDocument(
  documents: Map<string, HusqvarnaPortalDocument>,
  rawUrl: string,
  rawTitle: string,
  html: string,
  index: number,
): void {
  const url = officialDocumentUrl(rawUrl);
  if (!url) return;

  const provisionalTitle = stripMarkup(rawTitle);
  const type = documentType(provisionalTitle, url);
  if (type === 'OTHER') return;

  const title = provisionalTitle.length >= 3 && provisionalTitle.length <= 280
    ? provisionalTitle
    : titleNear(html, index, type);
  const key = documentIdentity(url);
  const candidate: HusqvarnaPortalDocument = {
    title,
    type,
    url,
    date: documentDate(title),
    language: documentLanguage(title),
  };

  const current = documents.get(key);
  if (!current || current.title.startsWith('IPL oficial') || current.title.startsWith('Manual oficial')) {
    documents.set(key, candidate);
  }
}

export function parseHusqvarnaPortalSearchHtml(
  html: string,
  pncInput: string,
  portalUrlOverride?: string,
): HusqvarnaPortalCatalogResult | null {
  const pnc = normalizeIdentifier(pncInput);
  if (!pnc) return null;

  const portalUrl = portalUrlOverride || `${HUSQVARNA_PORTAL_ORIGIN}${HUSQVARNA_PORTAL_COUNTRY_PATH}?q=${encodeURIComponent(pnc)}`;
  const documents = new Map<string, HusqvarnaPortalDocument>();

  const anchorRegex = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorRegex)) {
    addDocument(documents, match[2], match[3], html, match.index ?? 0);
  }

  const rawUrlRegex = /https?:\\?\/\\?\/[^"'<>\s]+|\/(?:[^"'<>\s]*?(?:tdrdownload|printipl=true)[^"'<>\s]*)/gi;
  for (const match of html.matchAll(rawUrlRegex)) {
    addDocument(documents, match[0], '', html, match.index ?? 0);
  }

  const resultDocuments = [...documents.values()]
    .sort((left, right) => {
      const priority = (value: HusqvarnaPortalDocumentType) => value === 'IPL' ? 0 : value === 'OM' ? 1 : 2;
      const typeDiff = priority(left.type) - priority(right.type);
      if (typeDiff !== 0) return typeDiff;
      const dateDiff = String(right.date || '').localeCompare(String(left.date || ''));
      if (dateDiff !== 0) return dateDiff;
      return left.title.localeCompare(right.title, 'pt-BR');
    })
    .slice(0, 20);

  const productName = extractProductName(html, pnc);
  const discontinued = /\bDESCONTINUADO\b|\bDISCONTINUED\b/i.test(stripMarkup(html));
  if (!productName && resultDocuments.length === 0) return null;

  return {
    pnc,
    productName,
    discontinued,
    portalUrl,
    documents: resultDocuments,
  };
}

export class HusqvarnaPortalCatalogService {
  static buildSearchUrl(pncInput: string): string {
    const pnc = normalizeIdentifier(pncInput);
    if (!pnc || pnc.length < 6 || pnc.length > 24) throw new Error('PNC inválido.');
    return `${HUSQVARNA_PORTAL_ORIGIN}${HUSQVARNA_PORTAL_COUNTRY_PATH}?q=${encodeURIComponent(pnc)}`;
  }

  static async searchByPnc(pncInput: string): Promise<HusqvarnaPortalCatalogResult | null> {
    const pnc = normalizeIdentifier(pncInput);
    if (!pnc || pnc.length < 6 || pnc.length > 24) return null;

    const cached = catalogCache.get(pnc);
    if (cached !== undefined) return cached.result;

    const graphqlMatch = await HusqvarnaPortalGraphqlService.searchProductByPnc(pnc);
    if (graphqlMatch) {
      const result: HusqvarnaPortalCatalogResult = {
        pnc,
        productName: graphqlMatch.productName,
        discontinued: graphqlMatch.discontinued,
        portalUrl: graphqlMatch.portalUrl,
        documents: [],
      };
      catalogCache.set(pnc, { result }, { ttl: PORTAL_SUCCESS_TTL_MS });
      return result;
    }

    const verified = getVerifiedHusqvarnaPortalProduct(pnc);
    if (verified) {
      console.warn(`[Husqvarna Portal] PNC ${pnc}: usando rota verificada localmente porque a GraphQL não confirmou o produto.`);
      catalogCache.set(pnc, { result: verified }, { ttl: PORTAL_SUCCESS_TTL_MS });
      return verified;
    }

    catalogCache.set(pnc, { result: null }, { ttl: PORTAL_MISS_TTL_MS });
    return null;
  }
}
