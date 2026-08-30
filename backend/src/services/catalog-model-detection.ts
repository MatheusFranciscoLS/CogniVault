function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedLine(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function compactModel(value: string): string {
  const normalized = normalizedLine(value);
  return /^\d{2,4}(?:\s+[A-Z0-9®.-]+)+$/i.test(normalized)
    ? normalized.replace(/\s+/g, '')
    : normalized;
}

export type CatalogModelHints = {
  model?: string | null;
  filename?: string | null;
};

/**
 * Modelos de produto Husqvarna sempre carregam pelo menos um algarismo.
 * Isso exclui descrições de peça/seção que o PDF parser pode devolver perto de
 * cabeçalhos (ex. "FIOS", "assy 321S" ou uma linha inteira de peça).
 */
export function isPlausibleCatalogModel(value: string | null | undefined): boolean {
  const candidate = normalizedLine(clean(value).replace(/[\r\n]+/g, ' '));
  if (!candidate || candidate.length > 64 || !/\d/.test(candidate)) return false;
  if (/^(?:ASSY|ASSEMBLY|KIT|CONJ(?:UNTO)?|SERVICE\s+KIT|SPARE\s+PARTS?|PE[CÇ]AS?|PARTS?)\b/i.test(candidate)) return false;
  if (/^\d{1,3}\s+(?:\d{8,12}|\d{3}\s+\d{2}\s+\d{2}-\d{2})\s+\S+/i.test(candidate)) return false;
  if (/\b(?:SCREW|BOLT|NUT|WASHER|TAMPA|COVER|FILTER|FILTRO|WIRE|FIOS?|SPRING|MOLA)\b/i.test(candidate) && candidate.split(/\s+/).length > 2) return false;
  return /^[A-Z0-9][A-Z0-9 .®_+/-]*$/i.test(candidate);
}

function filenameModel(filename: string): string {
  const base = normalizedLine(filename.replace(/\.pdf$/i, ''));
  const candidate = clean(base.match(/Husqvarna\s+(.+)$/i)?.[1] || '');
  return isPlausibleCatalogModel(candidate) ? candidate : '';
}

function modelFromPortalUrl(text: string): string {
  const matches = [...text.matchAll(/https?:\/\/portal\.husqvarnagroup\.com\/br\/[^\s?]+\/[^\s/?]*husqvarna-([a-z0-9-]+)\/?\?printipl=true/gi)];
  for (const match of matches) {
    const candidate = match[1].replace(/-/g, ' ').toUpperCase();
    if (isPlausibleCatalogModel(candidate)) return compactModel(candidate);
  }
  return '';
}

function modelFromPortalHeader(text: string): string {
  const flattened = text.replace(/[\u00a0\u202f]/g, ' ').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ');
  const matches = [...flattened.matchAll(/Husqvarna\s+([A-Z0-9][A-Z0-9 .®_-]{0,50}?)\s+Husqvarna\s*\|\s*Husqvarna\s+Portal\s+BR/gi)];
  for (const match of matches) {
    const candidate = normalizedLine(match[1]);
    if (isPlausibleCatalogModel(candidate)) return compactModel(candidate);
  }
  return '';
}

function modelFromIplTitle(text: string): string {
  const candidate = clean(text.match(/IPL,\s*([^,\n]+),\s*\d{4}-\d{2}/i)?.[1]);
  return isPlausibleCatalogModel(candidate) ? compactModel(candidate) : '';
}

function modelFromModelNumber(text: string): string {
  const matches = [...text.matchAll(/MODEL\s+NUMBER\s*:?\s*([^\r\n]{1,80})/gi)];
  for (const match of matches) {
    const raw = normalizedLine(match[1]).split(/\s+(?:MFG\.|PRODUCT\s+NO\.|PNC)\b/i)[0];
    if (isPlausibleCatalogModel(raw)) return compactModel(raw);
  }
  return '';
}

function modelFromProductHeading(text: string): string {
  const matches = [...text.matchAll(/^\s*([A-Z0-9]{1,12}(?:\s+[A-Z0-9®.-]{1,12}){0,3})\s+(?:LAWN\s+MOWER|CHAIN\s+SAW|CHAINSAW|TRACTOR|BLOWER|TRIMMER|BRUSHCUTTER|ENGINE|SPRAYER|POLE\s+SAW|HEDGE\s+TRIMMER)\b/gim)];
  for (const match of matches) {
    const candidate = normalizedLine(match[1]);
    if (isPlausibleCatalogModel(candidate)) return compactModel(candidate);
  }
  return '';
}

/**
 * Ordem de confiança: URL oficial do Portal -> cabeçalho oficial -> título IPL ->
 * MODEL NUMBER validado -> heading de produto -> hint manual -> filename.
 * O nome do arquivo é sempre último porque pode estar incorreto (ex. arquivo
 * chamado 345BT cujo próprio Portal identifica como 340BT).
 */
export function detectTrustedCatalogModel(text: string, hints: CatalogModelHints = {}): string {
  const evidence = [
    modelFromPortalUrl(text),
    modelFromPortalHeader(text),
    modelFromIplTitle(text),
    modelFromModelNumber(text),
    modelFromProductHeading(text),
  ].find(Boolean);
  if (evidence) return evidence;

  const hinted = normalizedLine(clean(hints.model));
  if (isPlausibleCatalogModel(hinted)) return hinted;
  return filenameModel(clean(hints.filename));
}
