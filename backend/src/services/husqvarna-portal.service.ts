import { normalizeIdentifier, normalizeText } from '../utils/normalize';
import { buildHusqvarnaPortalUrl } from './official-part-verification.service';

const PORTAL_HOST = 'portal.husqvarnagroup.com';
const CACHE_TTL_MS = 15 * 60 * 1000;
const configuredTimeout = Number(process.env.HUSQVARNA_PORTAL_TIMEOUT_MS || '6000');
const REQUEST_TIMEOUT_MS = Number.isFinite(configuredTimeout)
  ? Math.max(1_500, Math.min(12_000, configuredTimeout))
  : 6_000;

type PortalStatus = 'VERIFIED' | 'SUPERSEDED' | 'REVIEW';

export interface HusqvarnaPortalLookup {
  requestedPartNumber: string;
  currentPartNumber: string;
  description: string | null;
  status: PortalStatus;
  officialUrl: string;
  previousPartNumbers: string[];
  fetchedAt: string;
  source: 'HUSQVARNA_PUBLIC_PORTAL';
}

type CachedLookup = { expiresAt: number; value: HusqvarnaPortalLookup };
const lookupCache = new Map<string, CachedLookup>();

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function htmlToText(html: string): string {
  return decodeHtml(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function tagText(html: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  return [...html.matchAll(regex)]
    .map(match => htmlToText(match[1] || '').trim())
    .filter(Boolean);
}

function normalizedPartNumber(value: string): string {
  const normalized = normalizeIdentifier(value);
  const digits = normalized.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 12 ? digits : '';
}

function extractNumberNearLabel(text: string): string {
  const patterns = [
    /(?:n[uú]mero\s+do\s+artigo|numero\s+do\s+artigo)\s*:?\s*((?:\d[\s\u00a0-]*){8,12})/i,
    /(?:article\s+number|part\s+number)\s*:?\s*((?:\d[\s\u00a0-]*){8,12})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const parsed = match?.[1] ? normalizedPartNumber(match[1]) : '';
    if (parsed) return parsed;
  }
  return '';
}

function extractExplicitReplacement(text: string): string {
  const patterns = [
    /(?:substitu[ií]d[oa]|substitu[ií]da\s+por|substitu[ií]do\s+por|substitu[ií]da\s+pelo|substitu[ií]do\s+pelo)[^\d]{0,100}((?:\d[\s\u00a0-]*){8,12})/i,
    /(?:replaced\s+by|superseded\s+by)[^\d]{0,100}((?:\d[\s\u00a0-]*){8,12})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const parsed = match?.[1] ? normalizedPartNumber(match[1]) : '';
    if (parsed) return parsed;
  }
  return '';
}

function extractPartNumbers(value: string): string[] {
  const formatted = value.match(/\b\d{3}[\s\u00a0]*\d{2}[\s\u00a0]*\d{2}(?:[\s\u00a0-]*\d{2})\b/g) || [];
  const compact = value.match(/\b\d{8,12}\b/g) || [];
  return [...new Set([...formatted, ...compact].map(normalizedPartNumber).filter(Boolean))];
}

function replacementHistory(text: string, currentPartNumber: string): string[] {
  const normalized = normalizeText(text);
  const headings = ['historico de substituicao', 'replacement history', 'supersession history'];
  const heading = headings.find(value => normalized.includes(value));
  if (!heading) return [];

  const normalizedIndex = normalized.indexOf(heading);
  const originalWindowStart = Math.max(0, Math.floor((normalizedIndex / Math.max(1, normalized.length)) * text.length) - 100);
  const window = text.slice(originalWindowStart, originalWindowStart + 2_400);
  const numbers = extractPartNumbers(window);
  return numbers.filter(number => number !== currentPartNumber).slice(0, 20);
}

function pageDescription(html: string): string | null {
  const headings = [...tagText(html, 'h1'), ...tagText(html, 'h2')];
  const ignored = ['husqvarna portal', 'pecas sobressalentes', 'peças sobressalentes', 'spare parts'];
  const description = headings.find(value => {
    const normalized = normalizeText(value);
    return normalized.length >= 2 && !ignored.some(item => normalized === normalizeText(item));
  });
  return description?.slice(0, 500) || null;
}

export function parseHusqvarnaPortalHtml(html: string, requestedPartNumber: string): HusqvarnaPortalLookup {
  const requested = normalizedPartNumber(requestedPartNumber);
  if (!requested) throw new Error('Código de peça Husqvarna inválido.');

  const text = htmlToText(html);
  const labeledCurrent = extractNumberNearLabel(text);
  const explicitReplacement = extractExplicitReplacement(text);
  const current = explicitReplacement || labeledCurrent || requested;
  const description = pageDescription(html);
  const previousPartNumbers = replacementHistory(text, current)
    .filter(number => number !== requested || current === requested);

  // Descrição isolada não é evidência suficiente: páginas de erro também podem
  // ter um H1. Só marcamos VERIFICADO/SUBSTITUÍDO quando existe número de artigo,
  // substituição explícita ou uma cadeia de substituição identificável.
  const hasTechnicalEvidence = Boolean(labeledCurrent || explicitReplacement || previousPartNumbers.length);
  const status: PortalStatus = !hasTechnicalEvidence
    ? 'REVIEW'
    : current !== requested
      ? 'SUPERSEDED'
      : 'VERIFIED';

  return {
    requestedPartNumber: requested,
    currentPartNumber: current,
    description,
    status,
    officialUrl: buildHusqvarnaPortalUrl(current),
    previousPartNumbers,
    fetchedAt: new Date().toISOString(),
    source: 'HUSQVARNA_PUBLIC_PORTAL',
  };
}

function assertPublicPortalResponse(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== PORTAL_HOST) {
    throw new Error('O Portal Husqvarna redirecionou para um endereço não permitido.');
  }
  const normalizedPath = parsed.pathname.toLowerCase();
  if (normalizedPath.includes('login') || normalizedPath.includes('signin') || normalizedPath.includes('auth')) {
    throw new Error('A consulta pública foi redirecionada para autenticação e foi interrompida.');
  }
}

export class HusqvarnaPortalService {
  static async lookup(partNumber: string): Promise<HusqvarnaPortalLookup> {
    const normalized = normalizedPartNumber(partNumber);
    if (!normalized) throw new Error('Código de peça Husqvarna inválido.');

    const cached = lookupCache.get(normalized);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const url = buildHusqvarnaPortalUrl(normalized);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'CogniVault/1.0 public-parts-lookup',
        },
      });

      assertPublicPortalResponse(response.url || url);
      if (!response.ok) throw new Error(`Portal Husqvarna respondeu HTTP ${response.status}.`);

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('text/html')) {
        throw new Error('O Portal Husqvarna não retornou uma página HTML pública.');
      }

      const html = await response.text();
      if (!html.trim()) throw new Error('O Portal Husqvarna retornou uma página vazia.');

      const value = parseHusqvarnaPortalHtml(html, normalized);
      lookupCache.set(normalized, { expiresAt: Date.now() + CACHE_TTL_MS, value });
      return value;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('A consulta pública ao Portal Husqvarna excedeu o tempo limite.');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
