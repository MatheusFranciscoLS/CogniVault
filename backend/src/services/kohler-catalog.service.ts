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
import { OfficialPartIndexService } from './official-part-index.service';

const TIMEOUT_MS = 15_000;

/**
 * Cache longo e persistente, como o da Kawasaki: o catálogo de um motor não muda em semanas, e o Render free reinicia com frequência.
 * Cada grupo tem cache próprio, porque o balcão abre um grupo por atendimento, não os 18.
 */
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * **A Kohler tem uma trava anti-robô (reCAPTCHA).** Medido em 2026-10-08: depois de poucas leituras seguidas (uns 6 grupos em sequência) o servidor
 * deles responde 302 para `home/validaterecaptcha`, e a página de verificação não tem catálogo. Isso NÃO é "sem catálogo" e NUNCA pode virar resposta
 * guardada por 7 dias. Também NÃO se contorna: é uma verificação de segurança do fornecedor. O que o sistema faz é reconhecer, não insistir
 * (freio de 5 minutos) e mandar o atendente ao catálogo oficial, que ele abre no navegador dele e resolve a verificação ali.
 */
export class KohlerBlockedError extends Error {
  constructor() {
    super('A Kohler pediu uma verificação anti-robô (reCAPTCHA).');
  }
}

const BLOCK_COOLDOWN_MS = 5 * 60 * 1000;
let blockedUntil = 0;

/** A Kohler não respondeu direito (5xx, rede): é indisponibilidade, não ausência de catálogo, e também nunca vai para o cache. */
export class KohlerUnavailableError extends Error {
  constructor(detail: string) {
    super(`A Kohler não respondeu: ${detail}`);
  }
}

export function resetKohlerBlockForTests(): void {
  blockedUntil = 0;
}

export type KohlerEngineCatalog = {
  /** Spec como o balcão digitou, normalizado (`SV540-3212`). */
  spec: string;
  /** Nome que a Kohler dá ao motor (`SV540 - Courage Single (SV)`). Nulo quando o catálogo não conhece o spec. */
  description: string | null;
  groups: KohlerGroup[];
  /** Catálogo oficial deste motor, para o atendente conferir à mão. */
  catalogUrl: string;
  lookupUrl: string;
  /** Não foi possível ler agora (`CAPTCHA`: a Kohler pediu verificação anti-robô; `ERRO`: não respondeu). NÃO é falta de catálogo: a tela manda abrir o catálogo oficial. */
  unavailable?: 'CAPTCHA' | 'ERRO';
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
  unavailable?: 'CAPTCHA' | 'ERRO';
};

const EMPTY_ENGINE = (spec: string): KohlerEngineCatalog => ({
  spec,
  description: null,
  groups: [],
  catalogUrl: spec ? kohlerEngineUrl(spec) : kohlerLookupUrl(),
  lookupUrl: kohlerLookupUrl(),
});

const unavailableGroup = (unavailable: 'CAPTCHA' | 'ERRO'): KohlerGroupDetail => ({ title: null, parts: [], imageUrl: null, hotspots: [], referenceWidth: null, referenceHeight: null, unavailable });

async function getText(url: string, accept: string): Promise<string | null> {
  if (Date.now() < blockedUntil) throw new KohlerBlockedError();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // `manual`: o redirect da trava anti-robô tem que ser VISTO, não seguido (seguido, vira uma página 200 sem catálogo e parece "sem catálogo").
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { Accept: accept, 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'Mozilla/5.0 (compatible; CogniVault/1.0)' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location') ?? '';
      if (/validaterecaptcha/i.test(location)) {
        blockedUntil = Date.now() + BLOCK_COOLDOWN_MS;
        throw new KohlerBlockedError();
      }
      // Outro redirect (spec desconhecido volta para a busca): é "sem catálogo", não erro.
      return null;
    }
    if (!response.ok) throw new KohlerUnavailableError(`HTTP ${response.status}`);
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
    return hit.value ?? null;
  } catch (cacheError) {
    // A trava anti-robô não é falha de cache: repetir a consulta só a reforçaria.
    if (cacheError instanceof KohlerBlockedError || cacheError instanceof KohlerUnavailableError) throw cacheError;
    // Cache no Postgres, que no plano free pausa. É otimização, não requisito: sem ele a consulta segue direto.
    console.warn('[Kohler] Cache indisponível para %j; consultando direto.', resourceId, cacheError instanceof Error ? cacheError.message : cacheError);
  }
  return loader();
}

export class KohlerCatalogService {
  /**
   * Grupos de um motor Kohler. Nunca lança: spec que a Kohler não conhece devolve o catálogo vazio com o link da busca oficial, e a trava
   * anti-robô ou um erro de rede/5xx devolvem `unavailable` (que NÃO é guardado no cache) com o link do catálogo oficial.
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
      if (error instanceof KohlerBlockedError) return { ...EMPTY_ENGINE(spec), unavailable: 'CAPTCHA' };
      console.warn('[Kohler] Não foi possível resolver o catálogo de %j:', spec, error instanceof Error ? error.message : error);
      // Erro de rede ou 5xx: indisponível agora, e não "sem catálogo" (que a tela diria como se fosse definitivo).
      return { ...EMPTY_ENGINE(spec), unavailable: 'ERRO' };
    }
  }

  /** Um grupo aberto: a tabela de peças E o desenho com as posições. Trava anti-robô ou erro devolvem `unavailable`, sem cache. */
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
          const svg = await getText(drawing.imageUrl, 'image/svg+xml,*/*').catch(error => {
            // O desenho bloqueado derruba o grupo inteiro (e não vai para o cache): meia vista guardada por 7 dias seria pior que nenhuma.
            if (error instanceof KohlerBlockedError) throw error;
            return null;
          });
          if (svg) {
            const inTable = new Set(parts.map(part => part.position).filter((value): value is string => Boolean(value)));
            const read = parseKohlerHotspots(svg);
            hotspots = read.hotspots.filter(spot => inTable.has(spot.position));
            referenceWidth = read.width;
            referenceHeight = read.height;
          }
        }
        // Dentro do loader: só indexa quando a Kohler foi consultada de verdade, não a cada clique que o cache responde. Sem await: é efeito
        // colateral (o balcão não espera gravação) e `record` nunca lança. O spec vem validado do próprio pedido, nunca deduzido do HTML.
        if (parts.length) {
          const groupName = (drawing.title ?? '').split(' - ')[0].trim() || null;
          void OfficialPartIndexService.record('KOHLER', spec, parts.map(part => ({
            partNumber: part.partNumber,
            name: part.name,
            position: part.position,
            assembly: groupName,
            quantity: part.quantity,
          })));
        }
        return { title: drawing.title, parts, imageUrl: drawing.imageUrl, hotspots, referenceWidth, referenceHeight };
      });
    } catch (error) {
      if (error instanceof KohlerBlockedError) return unavailableGroup('CAPTCHA');
      console.warn('[Kohler] Não foi possível ler o grupo %j de %j:', sectionId, spec, error instanceof Error ? error.message : error);
      return unavailableGroup('ERRO');
    }
  }
}
