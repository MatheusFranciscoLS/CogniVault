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
 * Retorna true somente quando os candidatos demonstram uma troca de código por
 * número de série na MESMA ocorrência técnica. Uma nota isolada nunca basta.
 * Se o usuário já informou S/N, o gate usa serialApplicability em vez de pedir de novo.
 */
export function requiresSerialConfirmation(question: string, candidates: SerialGuidanceCandidate[]): boolean {
  if (extractExplicitSerialNumber(question)) return false;

  const groups = new Map<string, Array<{ code: string; directions: Set<SerialRuleDirection> }>>();
  for (const candidate of candidates) {
    const directions = serialDirections(candidate.notes);
    if (!directions.size) continue;
    if (!normalizeIdentifier(candidate.position) || !normalizeIdentifier(candidate.section)) continue;
    const key = occurrenceKey(candidate);
    const rows = groups.get(key) || [];
    rows.push({ code: normalizeIdentifier(candidate.partNumber), directions });
    groups.set(key, rows);
  }

  for (const rows of groups.values()) {
    const codes = new Set(rows.map(row => row.code).filter(Boolean));
    if (codes.size < 2) continue;
    const directions = new Set(rows.flatMap(row => [...row.directions]));
    if (directions.has('UP_TO') && directions.has('FROM')) return true;
  }
  return false;
}
