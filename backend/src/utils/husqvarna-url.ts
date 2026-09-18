/**
 * Saneamento de URL vinda do Portal Husqvarna.
 *
 * Tudo aqui é dado de terceiro que termina em `href` no navegador do balcão, ou
 * em `fetch` no servidor. Portanto: só `https`, e só domínio da Husqvarna.
 *
 * `isHostOrSubdomain` estava duplicado em `husqvarna-official-detail.service.ts`
 * e `husqvarna-product-search.service.ts`. Guard de segurança duplicado é como
 * uma das cópias vira buraco quando alguém corrige só a outra — por isso a
 * definição passou a viver aqui, e os dois serviços importam desta.
 */

/** Domínios que a Husqvarna usa para portal, site e CDN de documento/imagem. */
export const HUSQVARNA_ASSET_DOMAINS = ['husqvarnagroup.com', 'husqvarna.com', 'aprimocdn.net'] as const;

export const HUSQVARNA_PORTAL_ORIGIN = 'https://portal.husqvarnagroup.com';

/**
 * `true` quando `host` é exatamente `domain` ou um subdomínio dele.
 *
 * A comparação usa o ponto separador (`.dominio`) de propósito: um teste com
 * `endsWith(domain)` cru aceitaria `husqvarnagroup.com.atacante.net`.
 */
export function isHostOrSubdomain(host: string, domain: string): boolean {
  const normalizedHost = host.toLowerCase().replace(/\.$/, '');
  const normalizedDomain = domain.toLowerCase().replace(/\.$/, '');
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

/**
 * URL de documento/ativo do Portal, ou `null` se não for confiável. Relativa é
 * resolvida contra o portal, que é como a API devolve parte dos links.
 */
export function safeHusqvarnaAssetUrl(value: unknown): string | null {
  // Só string. Sem isto, `42` virava `https://portal.husqvarnagroup.com/42` —
  // um link válido feito de lixo, que chega na tela como documento quebrado.
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw) return null;

  // Relativo só quando é de fato um caminho. Um texto qualquer ("não é url")
  // não deve ser resolvido contra o portal e virar link.
  const base = raw.startsWith('/') ? HUSQVARNA_PORTAL_ORIGIN : undefined;

  try {
    const url = new URL(raw, base);
    if (url.protocol !== 'https:') return null;
    if (!HUSQVARNA_ASSET_DOMAINS.some(domain => isHostOrSubdomain(url.hostname, domain))) return null;
    return url.toString();
  } catch {
    return null;
  }
}
