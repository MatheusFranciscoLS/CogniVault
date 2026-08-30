import type { CatalogExtraction, ExtractedPart } from './catalog-extractor';

function clean(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Um único item físico do IPL pode virar vários registros Part quando a mesma
 * linha possui aplicações por PNC. Para auditoria e UI precisamos contar a linha
 * do catálogo uma única vez, ignorando somente a expansão de aplicação.
 */
export function catalogSourceOccurrenceKey(part: Pick<ExtractedPart, 'page' | 'section' | 'position' | 'partNumber' | 'name' | 'notes'>): string {
  return [
    Number.isInteger(part.page) ? String(part.page) : '0',
    clean(part.section),
    clean(part.position),
    clean(part.partNumber),
    clean(part.name),
    clean(part.notes),
  ].join('|');
}

export function countCatalogSourceRows(extraction: CatalogExtraction): number {
  return new Set(extraction.parts.map(catalogSourceOccurrenceKey)).size;
}
