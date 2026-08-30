import { inferCatalogSection } from './catalog-section-inference';
import { detectTrustedCatalogModel } from './catalog-model-detection';
import type { CatalogExtraction, CatalogHints, ExtractedPart } from './catalog-extractor';

const LEGACY_HEADER = /REF\.\s+PART\s+NO\.\s+DESCRIPTION\s+REMARK\s+QTY\.\s+KIT/i;
const REF_PREFIX = /^\s*(\d{3})\s+(\d{2})\s+(\d{2})-\s*$/;
const REF_SUFFIX = /^\s*(\d{2})\s*$/;
const PART_LINE = /^\s*(\d{8,12})\s+(.+?)\s+(\d{1,3})\s*$/;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLine(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, ' ').replace(/[\u00ad\ufffe\ufffd]/g, '-').replace(/[ \t]+/g, ' ').trim();
}

function pageNumber(pageIndex: number): number {
  return pageIndex + 1;
}

/**
 * IPLs Husqvarna antigos (ex. 142R) não possuem posição numérica de vista.
 * Eles usam REF em uma coluna quebrada em duas linhas e um PART NO. contínuo.
 * O REF é preservado em notes, mas NÃO é inventado como "posição na vista".
 */
export function parseLegacyRefCatalog(text: string, hints: CatalogHints = {}): CatalogExtraction | null {
  if (!LEGACY_HEADER.test(text)) return null;
  const model = detectTrustedCatalogModel(text, hints);
  if (!model) return null;
  const manufacturer = clean(hints.manufacturer) || 'Husqvarna';
  const parts: ExtractedPart[] = [];
  const pages = text.split(/\f/);

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const lines = pages[pageIndex].split(/\r?\n/).map(normalizeLine);
    const pageRows: Array<{ partNumber: string; name: string; quantity: string; ref: string }> = [];

    for (let index = 0; index < lines.length - 2; index += 1) {
      const prefix = REF_PREFIX.exec(lines[index]);
      if (!prefix) continue;
      const part = PART_LINE.exec(lines[index + 1]);
      const suffix = REF_SUFFIX.exec(lines[index + 2]);
      if (!part || !suffix) continue;
      const ref = `${prefix[1]} ${prefix[2]} ${prefix[3]}-${suffix[1]}`;
      pageRows.push({ partNumber: part[1], name: clean(part[2]), quantity: part[3], ref });
      index += 2;
    }

    if (!pageRows.length) continue;
    const section = inferCatalogSection(pageRows.map(row => ({ name: row.name }))) || 'Peças';
    for (const row of pageRows) {
      parts.push({
        manufacturer,
        model,
        pnc: clean(hints.pnc),
        universalAcrossPnc: !clean(hints.pnc),
        section,
        position: '',
        name: row.name,
        alternativeNames: [],
        partNumber: row.partNumber,
        page: pageNumber(pageIndex),
        notes: [`REF: ${row.ref}`, `Quantidade: ${row.quantity}`].join('. '),
      });
    }
  }

  if (parts.length < 10) return null;
  return {
    manufacturer,
    models: [model],
    pncs: clean(hints.pnc) ? [clean(hints.pnc)] : [],
    parts,
  };
}
