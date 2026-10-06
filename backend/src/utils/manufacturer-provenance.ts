import { normalizeIdentifier } from './normalize';

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Nome de arquivo só conta como evidência quando traz explicitamente a marca.
 * Modelo/código nunca decide fabricante por formato.
 */
export function explicitManufacturerFromFilename(filename: string | null | undefined): string | null {
  const value = (filename || '').trim();
  if (/\bHusqvarna\b/i.test(value)) return 'Husqvarna';
  if (/\bKawasaki\b/i.test(value)) return 'Kawasaki';
  if (/\bBriggs\b/i.test(value)) return 'Briggs & Stratton';
  if (/\bKohler\b/i.test(value)) return 'Kohler';
  if (/\bHonda\b/i.test(value)) return 'Honda';
  return null;
}

export function resolveManufacturerEvidence(input: {
  partManufacturer?: string | null;
  documentManufacturer?: string | null;
  extractedManufacturer?: string | null;
  filename?: string | null;
}): string | null {
  return clean(input.partManufacturer)
    || clean(input.documentManufacturer)
    || clean(input.extractedManufacturer)
    || explicitManufacturerFromFilename(input.filename);
}

export function isHusqvarnaManufacturer(value: string | null | undefined): boolean {
  return normalizeIdentifier(value).includes('HUSQVARNA');
}
