import { LRUCache } from 'lru-cache';
import { normalizeIdentifier } from '../utils/normalize';

const SUPPORT_ORIGIN = 'https://www.husqvarna.com';
const TIMEOUT_MS = 5_000;

export type HusqvarnaPublicSupportResult = {
  url: string;
  title: string | null;
  verifiedBy: 'PNC' | 'MODEL';
};

type SupportCacheEntry = {
  result: HusqvarnaPublicSupportResult | null;
};

const cache = new LRUCache<string, SupportCacheEntry>({ max: 500, ttl: 6 * 60 * 60 * 1000 });

function slugifyModel(productName: string): string {
  return productName
    .replace(/^HUSQVARNA\s+/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildHusqvarnaPublicSupportUrl(productName: string): string | null {
  const slug = slugifyModel(productName);
  return slug ? `${SUPPORT_ORIGIN}/br/suporte/${slug}/` : null;
}

function htmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  return match[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim() || null;
}

export class HusqvarnaPublicSupportService {
  static async verifyProduct(pncInput: string, productName: string): Promise<HusqvarnaPublicSupportResult | null> {
    const pnc = normalizeIdentifier(pncInput);
    const cacheKey = `${pnc}:${productName.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached.result;

    const url = buildHusqvarnaPublicSupportUrl(productName);
    if (!url) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
        },
      });
      if (!response.ok) {
        cache.set(cacheKey, { result: null }, { ttl: 20 * 60 * 1000 });
        return null;
      }

      const finalUrl = new URL(response.url || url);
      if (finalUrl.protocol !== 'https:' || finalUrl.hostname !== 'www.husqvarna.com') return null;

      const html = await response.text();
      const normalizedHtml = normalizeIdentifier(html);
      const normalizedModel = normalizeIdentifier(productName.replace(/^HUSQVARNA\s+/i, ''));
      const pncMatch = Boolean(pnc && normalizedHtml.includes(pnc));
      const modelMatch = Boolean(normalizedModel && normalizedHtml.includes(normalizedModel));
      if (!pncMatch && !modelMatch) {
        cache.set(cacheKey, { result: null }, { ttl: 20 * 60 * 1000 });
        return null;
      }

      const result: HusqvarnaPublicSupportResult = {
        url: finalUrl.toString(),
        title: htmlTitle(html),
        verifiedBy: pncMatch ? 'PNC' : 'MODEL',
      };
      cache.set(cacheKey, { result });
      return result;
    } catch (error) {
      console.warn(`[Husqvarna Support] Falha ao validar ${productName}/${pnc}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
