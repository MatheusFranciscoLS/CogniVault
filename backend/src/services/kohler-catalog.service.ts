import {
  KOHLER_ORIGIN,
  kohlerEngineUrl,
  kohlerLookupUrl,
  normalizeKohlerSpec,
  parseKohlerDrawing,
  parseKohlerEngineHeader,
  parseKohlerGroups,
  parseKohlerHotspots,
  parseKohlerParts,
  type KohlerGroup,
  type KohlerHotspot,
  type KohlerPart,
} from '../utils/kohler-catalog';
import { OfficialSourceCacheService, buildOfficialSourceCacheKey } from './official-source-cache.service';

const TIMEOUT_MS = 15_000;

/**
 * Cache longo e persistente, como o da Kawasaki: o catálogo de um motor não muda em semanas, e o Render free reinicia com frequência.
 * Cada grupo tem cache próprio, porque o balcão abre um grupo por atendimento, não os 18.
 */
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_MS = 60 * 24 * 60 * 60 * 1000;

export type KohlerEngineCatalog = {
  /** Spec como o balcão digitou, normalizado (`SV540-3212`). */
  spec: string;
  /** Nome que a Kohler dá ao motor (`SV540 - Courage Single (SV)`). Nulo quando o catálogo não conhece o spec. */
  description: string | null;
  groups: KohlerGroup[];
  /** Catálogo oficial deste motor, para o atendente conferir à mão. */
  catalogUrl: string;
  lookupUrl: string;
};

export type KohlerGroupDetail = {
  title: string | null;
  parts: KohlerPart[];
  imageUrl: string | null;
  /** Só as posições que estão na tabela deste motor: o desenho é da série e traz números de peças que este spec não usa. */
  hotspots: KohlerHotspot[];
  /** Largura e altura do `viewBox` do desenho. O SVG da Kohler não declara tamanho: sem a proporção, a imagem colapsa a zero na tela. */
  referenceWidth: number | null;
  referenceHeight: number | null;
};

const EMPTY_ENGINE = (spec: string): KohlerEngineCatalog => ({
  spec,
  description: null,
  groups: [],
  catalogUrl: spec ? kohlerEngineUrl(spec) : kohlerLookupUrl(),
  lookupUrl: kohlerLookupUrl(),
});

async function getText(url: string, accept: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: accept, 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'Mozilla/5.0 (compatible; CogniVault/1.0)' },
    });
    if (!response.ok) return null;
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/** O desenho só é baixado do domínio da Kohler: a URL vem do HTML deles, e domínio de terceiro morre aqui. */
function isKohlerAsset(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === new URL(KOHLER_ORIGIN).hostname;
  } catch {
    return false;
  }
}

async function cached<T>(
  resourceType: string,
  resourceId: string,
  loader: () => Promise<T | null>,
): Promise<T | null> {
  const key = buildOfficialSourceCacheKey('KOHLER', resourceType, resourceId);
  try {
    const hit = await OfficialSourceCacheService.get<T>(
      key,
      { source: 'KOHLER', resourceType, resourceId, freshMs: FRESH_MS, staleMs: STALE_MS },
      loader,
    );
    if (hit.value) return hit.value;
  } catch (cacheError) {
    // Cache no Postgres, que no plano free pausa. É otimização, não requisito: sem ele a consulta segue direto.
    console.warn('[Kohler] Cache indisponível para %j; consultando direto.', resourceId, cacheError instanceof Error ? cacheError.message : cacheError);
  }
  return loader();
}

export class KohlerCatalogService {
  /**
   * Grupos de um motor Kohler. Nunca lança: spec que a Kohler não conhece devolve o catálogo vazio com o link da busca oficial,
   * que é o que o balcão precisa para conferir à mão.
   */
  static async forSpec(rawSpec: string | null | undefined): Promise<KohlerEngineCatalog> {
    const spec = normalizeKohlerSpec(rawSpec);
    if (!spec) return EMPTY_ENGINE('');

    try {
      const catalog = await cached<KohlerEngineCatalog>('ENGINE_GROUPS', spec, async () => {
        const html = await getText(kohlerEngineUrl(spec, '101', '01'), 'text/html');
        if (!html) return null;
        const header = parseKohlerEngineHeader(html);
        // A Kohler redireciona spec desconhecido para a busca, sem cabeçalho de motor: não é erro, é "sem catálogo".
        if (!header) return null;
        const groups = parseKohlerGroups(html);
        return { spec, description: header.description, groups, catalogUrl: kohlerEngineUrl(spec), lookupUrl: kohlerLookupUrl() };
      });
      return catalog ?? EMPTY_ENGINE(spec);
    } catch (error) {
      console.warn('[Kohler] Não foi possível resolver o catálogo de %j:', spec, error instanceof Error ? error.message : error);
      return EMPTY_ENGINE(spec);
    }
  }

  /** Um grupo aberto: a tabela de peças E o desenho com as posições. */
  static async group(rawSpec: string | null | undefined, rawSectionId: string | null | undefined): Promise<KohlerGroupDetail | null> {
    const spec = normalizeKohlerSpec(rawSpec);
    const sectionId = String(rawSectionId ?? '').trim();
    if (!spec || !/^\d{2,4}$/.test(sectionId)) return null;

    try {
      return await cached<KohlerGroupDetail>('GROUP_V2', `${spec}|${sectionId}`, async () => {
        const html = await getText(kohlerEngineUrl(spec, sectionId, sectionId.slice(-2)), 'text/html');
        if (!html || !parseKohlerEngineHeader(html)) return null;

        const parts = parseKohlerParts(html);
        const drawing = parseKohlerDrawing(html);
        let hotspots: KohlerHotspot[] = [];
        let referenceWidth: number | null = null;
        let referenceHeight: number | null = null;
        if (drawing.imageUrl && isKohlerAsset(drawing.imageUrl) && /\.svg(\?|$)/i.test(drawing.imageUrl)) {
          const svg = await getText(drawing.imageUrl, 'image/svg+xml,*/*').catch(() => null);
          if (svg) {
            const inTable = new Set(parts.map(part => part.position).filter((value): value is string => Boolean(value)));
            const read = parseKohlerHotspots(svg);
            hotspots = read.hotspots.filter(spot => inTable.has(spot.position));
            referenceWidth = read.width;
            referenceHeight = read.height;
          }
        }
        return { title: drawing.title, parts, imageUrl: drawing.imageUrl, hotspots, referenceWidth, referenceHeight };
      });
    } catch (error) {
      console.warn('[Kohler] Não foi possível ler o grupo %j de %j:', sectionId, spec, error instanceof Error ? error.message : error);
      return null;
    }
  }
}
