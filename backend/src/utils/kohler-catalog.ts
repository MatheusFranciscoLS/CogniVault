/**
 * Catálogo de peças Kohler (Global Parts Lookup, `partnersportal.kohlerpower.it`).
 *
 * Medido em 2026-10-08, sem login: a página do motor e a de cada grupo vêm prontas em HTML (não há API JSON), e o desenho de cada grupo é
 * um SVG público. Esta camada só LÊ esse HTML, com regex, e não faz rede; o transporte e o cache ficam em
 * `services/kohler-catalog.service.ts`.
 *
 * O que a Kohler publica e a Kawasaki não: a substituição de código (`replaces` / `replaced by`) com o texto do que foi trocado. Preço
 * não vem (o parâmetro `ShowMsrpPrice` não acrescenta coluna); o preço é da loja, como nos outros fabricantes.
 */

export const KOHLER_ORIGIN = 'https://partnersportal.kohlerpower.it';
const CATALOG_BASE = `${KOHLER_ORIGIN}/customer/servicepartscatalogue`;

/**
 * Spec Kohler como vem na plaqueta: série (2 a 3 letras + número), eventual letra, hífen e 4 dígitos (`SV540-3212`, `CH740-0001`).
 * Começa por LETRAS de propósito: o modelo Briggs começa por dígito (`104M02-0002`), e é essa diferença que separa os dois formatos.
 */
const KOHLER_SPEC = /^[A-Z]{2,3}\d{2,4}[A-Z]?-\d{4}$/;

export function normalizeKohlerSpec(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (value.length > 16) return null;
  return KOHLER_SPEC.test(value) ? value : null;
}

/** Busca oficial, para o atendente conferir à mão quando nada resolve. */
export function kohlerLookupUrl(): string {
  return `${CATALOG_BASE}/?ActiveTab=engine-search`;
}

export function kohlerEngineUrl(spec: string, sectionId?: string | null, groupCode?: string | null): string {
  const base = `${CATALOG_BASE}/partfinder?EngineMatNumber=${encodeURIComponent(spec)}`;
  if (!sectionId || !groupCode) return base;
  return `${base}&SectionId=${encodeURIComponent(sectionId)}&GroupCode=${encodeURIComponent(groupCode)}`;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

function textOf(html: string): string {
  return decodeHtml(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export type KohlerGroup = { sectionId: string; groupCode: string; name: string };

/** Grupos do motor (CrankShaft, CrankCase, Lubrication...), na ordem da página. */
export function parseKohlerGroups(html: string): KohlerGroup[] {
  const groups: KohlerGroup[] = [];
  const seen = new Set<string>();
  const button = /<button[^>]*data-target="#part-finder-(\d{2,4})-nav-item"[^>]*>([\s\S]*?)<\/button>/g;
  for (const match of html.matchAll(button)) {
    const sectionId = match[1];
    const name = textOf(match[2]);
    if (!name || seen.has(sectionId)) continue;
    seen.add(sectionId);
    groups.push({ sectionId, groupCode: String(sectionId).slice(-2), name });
  }
  return groups;
}

/** Spec e descrição do cabeçalho (`SV540-3212` · `SV540 - Courage Single (SV)`). Nulo quando a página não é de um motor. */
export function parseKohlerEngineHeader(html: string): { spec: string; description: string | null } | null {
  const spec = /<span>Spec<\/span>(?:&nbsp;|\s)*([A-Z0-9-]+)/i.exec(html)?.[1];
  if (!spec) return null;
  const description = /<span>Description<\/span>(?:&nbsp;|\s)*([^<\n]+)/i.exec(html)?.[1];
  return { spec: spec.toUpperCase(), description: description ? decodeHtml(description).trim() : null };
}

export type KohlerSubstitution = { code: string; note: string | null };

export type KohlerPart = {
  position: string | null;
  partNumber: string;
  name: string;
  quantity: number | null;
  note: string | null;
  kit: string | null;
  includedIn: string | null;
  /** Códigos que ESTE código substitui. */
  replaces: KohlerSubstitution[];
  /** Códigos que substituem este. Vazio com `discontinued`: a Kohler escreve "DISC. [not available]". */
  replacedBy: KohlerSubstitution[];
  discontinued: boolean;
};

function parseSubstitutionList(titleAttr: string): KohlerSubstitution[] {
  const html = decodeHtml(titleAttr);
  const items: KohlerSubstitution[] = [];
  for (const li of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
    const text = textOf(li[1]);
    const withNote = /^(.+?)\s*\[(.*)\]$/.exec(text);
    items.push(withNote ? { code: withNote[1].trim(), note: withNote[2].trim() || null } : { code: text, note: null });
  }
  return items;
}

/** Peças do grupo aberto, na ordem da tabela. Linha sem código é descartada: sem código não há o que o balcão pedir. */
export function parseKohlerParts(html: string): KohlerPart[] {
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(html.slice(html.indexOf('kp-app-part-table-container') >= 0 ? html.indexOf('kp-app-part-table-container') : 0))?.[1];
  if (!body) return [];
  const parts: KohlerPart[] = [];
  for (const row of body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(cell => cell[1]);
    if (cells.length < 8) continue;
    const [pos, kit, includedIn, codeCell, substitution, description, note, quantity] = cells;
    const partNumber = textOf(/<span[^>]*>([\s\S]*?)<\/span>/.exec(codeCell)?.[1] ?? codeCell);
    if (!partNumber) continue;

    const replaces: KohlerSubstitution[] = [];
    const replacedBy: KohlerSubstitution[] = [];
    for (const button of substitution.matchAll(/<button[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)) {
      const label = textOf(button[2]).toLowerCase();
      const list = parseSubstitutionList(button[1]);
      if (label.startsWith('replaced by')) replacedBy.push(...list);
      else if (label.startsWith('replaces')) replaces.push(...list);
    }
    const discontinued = replacedBy.some(item => /^disc/i.test(item.code));
    const qty = Number(textOf(quantity));
    parts.push({
      position: textOf(pos) || null,
      partNumber,
      name: textOf(description),
      quantity: Number.isFinite(qty) && qty > 0 ? qty : null,
      note: textOf(note) || null,
      kit: textOf(kit) || null,
      includedIn: textOf(includedIn) || null,
      replaces,
      replacedBy: discontinued ? [] : replacedBy,
      discontinued,
    });
  }
  return parts;
}

/** Nome do grupo aberto (`CrankShaft - Group: 01`) e o desenho dele. */
export function parseKohlerDrawing(html: string): { title: string | null; imageUrl: string | null } {
  const title = /<div class="kp-app-part-table-title">[\s\S]*?<h4>([\s\S]*?)<\/h4>/.exec(html)?.[1];
  const image = /<img[^>]*class="[^"]*part-finder-image-with-alternative[^"]*"[^>]*src="([^"]+)"/.exec(html)?.[1];
  const imageUrl = image ? decodeHtml(image) : null;
  return {
    title: title ? textOf(title) : null,
    // O desenho que falta vem como "ImageNotAvailable": não serve de vista explodida.
    imageUrl: imageUrl && /^https:\/\/partnersportal\.kohlerpower\.it\//.test(imageUrl) && !/ImageNotAvailable/i.test(imageUrl) ? imageUrl : null,
  };
}

export type KohlerHotspot = { position: string; left: number; top: number };

/**
 * Posições do desenho: os números do SVG são `<text transform="translate(x y)">N</text>` em coordenadas do `viewBox`. O ponto é o
 * canto inferior esquerdo do texto; o centro fica meia largura à direita e meia altura acima. Devolve porcentagem do desenho, que
 * é o que o `ExplodedView` espera. Sem `viewBox`, nada é marcado: marcar sem saber a escala seria adivinhar onde cada peça está.
 */
export function parseKohlerHotspots(svg: string): { hotspots: KohlerHotspot[]; width: number | null; height: number | null } {
  const box = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg);
  const width = box ? Number(box[1]) : NaN;
  const height = box ? Number(box[2]) : NaN;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return { hotspots: [], width: null, height: null };

  const FONT = 10;
  const hotspots: KohlerHotspot[] = [];
  const seen = new Set<string>();
  for (const match of svg.matchAll(/<text\b[^>]*transform="translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)"[^>]*>\s*(\d{1,3})\s*<\/text>/g)) {
    const [, rawX, rawY, label] = match;
    const key = `${label}|${rawX}|${rawY}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const x = Number(rawX) + (label.length * FONT * 0.56) / 2;
    const y = Number(rawY) - FONT * 0.36;
    const left = (x / width) * 100;
    const top = (y / height) * 100;
    if (left < 0 || left > 100 || top < 0 || top > 100) continue;
    hotspots.push({ position: label, left: Number(left.toFixed(2)), top: Number(top.toFixed(2)) });
  }
  return { hotspots, width, height };
}
