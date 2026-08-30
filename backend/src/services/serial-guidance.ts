import { normalizeIdentifier } from '../utils/normalize';
import { extractExplicitSerialNumber } from './candidate-specificity';

export type SerialGuidanceCandidate = {
  partNumber: string;
  documentId?: string | null;
  model?: string | null;
  pnc?: string | null;
  page?: number | null;
  section?: string | null;
  position?: string | null;
  notes?: string | null;
};

type SerialRuleDirection = 'UP_TO' | 'FROM';

function normalizedText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function serialDirections(notes: string | null | undefined): Set<SerialRuleDirection> {
  const text = normalizedText(notes || '');
  const directions = new Set<SerialRuleDirection>();
  if (!text) return directions;
  if (/(?:UP\s+TO|ATE)\s+(?:S\s*\/\s*N|SN|SERIAL(?:\s+NUMBER)?)\s*[:#.-]?\s*\d{6,16}\b/.test(text)
      || /(?:S\s*\/\s*N|SN|SERIAL(?:\s+NUMBER)?)\s*[:#.-]?\s*\d{6,16}\s+(?:AND\s+)?(?:BELOW|DOWN)\b/.test(text)
      || /(?:^|\s)\d{8,16}\s*-\s*\d{8,16}(?:\s|$)/.test(text)) directions.add('UP_TO');
  if (/(?:FROM|A\s+PARTIR\s+DE)\s+(?:S\s*\/\s*N|SN|SERIAL(?:\s+NUMBER)?)\s*[:#.-]?\s*\d{6,16}\b/.test(text)
      || /(?:S\s*\/\s*N|SN|SERIAL(?:\s+NUMBER)?)\s*[:#.-]?\s*\d{6,16}\s+(?:AND\s+)?(?:UP|ABOVE)\b/.test(text)
      || /(?:^|\s)\d{8,16}\s*-\s*CURRENT(?:\s|$)/.test(text)) directions.add('FROM');
  return directions;
}

function occurrenceKey(candidate: SerialGuidanceCandidate): string {
  return [
    candidate.documentId || '',
    normalizeIdentifier(candidate.model),
    normalizeIdentifier(candidate.pnc),
    candidate.page || 0,
    normalizeIdentifier(candidate.section),
    normalizeIdentifier(candidate.position),
  ].join('|');
}

/**
 * Só pede S/N quando a ocorrência do PRIMEIRO candidato possui uma troca de
 * código explicitamente delimitada por série. Isso evita que uma variante pouco
 * relevante, mais abaixo no ranking, bloqueie uma consulta que não depende dela.
 */
export function requiresSerialConfirmation(question: string, candidates: SerialGuidanceCandidate[]): boolean {
  if (extractExplicitSerialNumber(question) || candidates.length < 2) return false;
  const leadingKey = occurrenceKey(candidates[0]);
  if (!normalizeIdentifier(candidates[0].position) || !normalizeIdentifier(candidates[0].section)) return false;

  const rows = candidates
    .filter(candidate => occurrenceKey(candidate) === leadingKey)
    .map(candidate => ({ code: normalizeIdentifier(candidate.partNumber), directions: serialDirections(candidate.notes) }))
    .filter(row => row.code && row.directions.size > 0);

  const codes = new Set(rows.map(row => row.code));
  if (codes.size < 2) return false;
  const directions = new Set(rows.flatMap(row => [...row.directions]));
  return directions.has('UP_TO') && directions.has('FROM');
}
