import { normalizeIdentifier } from '../utils/normalize';
import { safeHusqvarnaAssetUrl } from '../utils/husqvarna-url';

/**
 * Segunda fonte da vista explodida: o SITE PÚBLICO da Husqvarna (husqvarna.com/br/suporte/...).
 *
 * Por que existe: o Portal (b2b) não tem todas as máquinas que a Husqvarna vende. O soprador 345BT (PNC 970466903) está na lista de
 * preços e tem peças e vista explodida no site público, mas no Portal o artigo nem existe, e a busca por "345BT" devolvia 350 e 340BT
 * (dono, 2026-10-08). O site público usa a MESMA API (`/hbd/graphql`) com outro nome de loja (`hbd-br-pt-br`); a mesma consulta por
 * artigo devolve as seções de vista explodida (imagem, peças, posição e coordenadas).
 *
 * É informação oficial e pública (robots.txt libera `/`), consultada só quando o Portal não responde. Preço nunca vem daqui.
 */
const PUBLIC_GRAPHQL_URL = 'https://www.husqvarna.com/hbd/graphql?';
const PUBLIC_ORIGIN = 'https://www.husqvarna.com';
const PUBLIC_SITE = 'hbd-br-pt-br';
const TIMEOUT_MS = 8_000;
const IMAGE_PROBE_TIMEOUT_MS = 5_000;

const PUBLIC_ARTICLE_QUERY = `
  query getSupportIpls($siteName: String!, $articleId: ID!) {
    site(name: $siteName) {
      articles {
        byIds(ids: [$articleId]) {
          id
          name { shortName }
          product { url category { name } }
          ipls {
            id
            name
            image
            articles { coordinates quantity id name number comment url }
          }
        }
      }
    }
  }
`;

export type PublicSupportArticle = {
  pnc: string;
  productName: string;
  categoryName: string | null;
  /** Seções no formato cru da API, já com o tamanho da imagem (o site público não o informa). */
  sections: any[];
};

/** Largura e altura de um PNG a partir dos primeiros 24 bytes (assinatura + bloco IHDR). */
export function parsePngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => bytes[index] !== value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 && width < 20_000 && height < 20_000 ? { width, height } : null;
}

/**
 * Tamanho da imagem sem baixá-la: pede só os 32 primeiros bytes. As coordenadas do desenho estão em pixels da imagem original, então
 * sem o tamanho não há como posicionar as bolinhas. Servidor que ignora o `Range` (responde 200 com o arquivo todo) é descartado.
 */
export async function probeImageSize(imageUrl: unknown): Promise<{ width: number; height: number } | null> {
  const url = safeHusqvarnaAssetUrl(imageUrl);
  if (!url) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Range: 'bytes=0-31', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36' } });
    if (response.status !== 206) {
      void response.body?.cancel().catch(() => undefined);
      return null;
    }
    return parsePngSize(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Lê a resposta crua da API do site público. Puro: não toca a rede. */
export function parsePublicSupportArticle(data: any, pnc: string): Omit<PublicSupportArticle, 'sections'> & { sections: any[] } | null {
  const article = data?.site?.articles?.byIds?.[0];
  if (!article || !Array.isArray(article.ipls) || article.ipls.length === 0) return null;
  const productName = String(article.name?.shortName || '').trim();
  if (!productName) return null;
  const sections = article.ipls.filter((section: any) => Array.isArray(section?.articles) && section.articles.length > 0);
  if (sections.length === 0) return null;
  return {
    pnc,
    productName,
    categoryName: article.product?.category?.name ? String(article.product.category.name).trim() : null,
    sections,
  };
}

async function postPublicGraphql(variables: Record<string, unknown>): Promise<any | null> {
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
      body: JSON.stringify({ operationName: 'getSupportIpls', query: PUBLIC_ARTICLE_QUERY, variables }),
    });
    if (!response.ok) {
      console.warn(`[Husqvarna site público] getSupportIpls retornou HTTP ${response.status}.`);
      return null;
    }
    const payload = await response.json() as { data?: unknown; errors?: Array<{ message?: string }> };
    if (payload.errors?.length) {
      console.warn(`[Husqvarna site público] getSupportIpls: ${payload.errors.map(error => error.message || 'erro').join('; ')}`);
      return null;
    }
    return payload.data ?? null;
  } catch (error) {
    console.warn(`[Husqvarna site público] getSupportIpls falhou: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** A vista explodida de um artigo (PNC de 9 dígitos) no site público, com o tamanho de cada imagem. `null` quando não há. */
export async function fetchPublicSupportArticle(pncInput: string): Promise<PublicSupportArticle | null> {
  const pnc = normalizeIdentifier(pncInput);
  if (!/^\d{9}$/.test(pnc)) return null;
  const data = await postPublicGraphql({ siteName: PUBLIC_SITE, articleId: pnc });
  const parsed = parsePublicSupportArticle(data, pnc);
  if (!parsed) return null;
  const sizes = await Promise.all(parsed.sections.map(section => probeImageSize(section?.image)));
  return {
    ...parsed,
    sections: parsed.sections.map((section, index) => ({
      ...section,
      referenceWidth: sizes[index]?.width ?? null,
      referenceHeight: sizes[index]?.height ?? null,
    })),
  };
}
