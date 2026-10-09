import { OfficialSourceCacheService, buildOfficialSourceCacheKey } from './official-source-cache.service';
import { parsePublicMachineUse, type PublicMachineUse } from '../utils/husqvarna-public-specs';

/**
 * Uso recomendado da máquina segundo o SITE PÚBLICO da Husqvarna (mesma API do vista explodida, loja `hbd-br-pt-br`, sem login; o robots.txt
 * libera `/`). Alimenta o orçamento de máquina. Preço nunca vem daqui. Ver `utils/husqvarna-public-specs.ts` para o que se aceita.
 */
const PUBLIC_GRAPHQL_URL = 'https://www.husqvarna.com/hbd/graphql?';
const PUBLIC_ORIGIN = 'https://www.husqvarna.com';
const PUBLIC_SITE = 'hbd-br-pt-br';
const TIMEOUT_MS = 8_000;
const FRESH_MS = 7 * 24 * 3600 * 1000;
const STALE_MS = 30 * 24 * 3600 * 1000;

const QUERY = `
  query getMachineUse($siteName: String!, $articleId: ID!) {
    site(name: $siteName) {
      articles {
        byIds(ids: [$articleId]) {
          id
          specificationValues { id formattedValue numericValue }
        }
      }
    }
  }
`;

export class PublicSpecsUnavailableError extends Error {}

/** O PNC da lista pode vir com `BR` no fim (`965801490BR`): o artigo é o de 9 dígitos. Fora disso, não consulta. */
export function publicSpecsArticleId(pncInput: string | null | undefined): string | null {
  const cleaned = String(pncInput ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase().replace(/(?<=\d)BR$/, '');
  return /^\d{9}$/.test(cleaned) ? cleaned : null;
}

async function loadFromSite(articleId: string): Promise<PublicMachineUse | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(PUBLIC_GRAPHQL_URL, {
      method: 'POST',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
        Origin: PUBLIC_ORIGIN,
        Referer: `${PUBLIC_ORIGIN}/br/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
      },
      body: JSON.stringify({ operationName: 'getMachineUse', query: QUERY, variables: { siteName: PUBLIC_SITE, articleId } }),
    });
    // Erro de rede ou do site NÃO é "a máquina não tem": lança, para o cache não guardar uma ausência falsa por uma semana.
    if (!response.ok) throw new PublicSpecsUnavailableError(`HTTP ${response.status}`);
    const payload = await response.json() as { data?: unknown; errors?: unknown[] };
    if (payload.errors?.length) throw new PublicSpecsUnavailableError('o site respondeu com erro');
    return parsePublicMachineUse(payload.data);
  } finally {
    clearTimeout(timeout);
  }
}

export class HusqvarnaPublicSpecsService {
  /** `null` quando o site não tem a máquina ou está fora do ar. Nunca lança: o orçamento sai completo sem isto. */
  static async useForPnc(pncInput: string | null | undefined): Promise<PublicMachineUse | null> {
    const articleId = publicSpecsArticleId(pncInput);
    if (!articleId) return null;
    const key = buildOfficialSourceCacheKey('HUSQVARNA_PUBLIC', 'MACHINE_USE', articleId);
    try {
      const hit = await OfficialSourceCacheService.get<PublicMachineUse | { absent: true }>(
        key,
        { source: 'HUSQVARNA_PUBLIC', resourceType: 'MACHINE_USE', resourceId: articleId, freshMs: FRESH_MS, staleMs: STALE_MS },
        async () => (await loadFromSite(articleId)) ?? { absent: true },
      );
      const value = hit.value;
      return value && !('absent' in value) ? value : null;
    } catch (error) {
      console.warn(`[Husqvarna site público] uso da máquina ${articleId} indisponível: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
