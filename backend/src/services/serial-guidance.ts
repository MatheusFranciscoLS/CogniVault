import { normalizeIdentifier } from '../utils/normalize';
import { extractExplicitSerialNumber } from './candidate-specificity';

export type SerialGuidanceCandidate = {
  partNumber: string;
  pnc?: string | null;
  section?: string | null;
  position?: string | null;
  notes?: string | null;
};

type SerialRuleDirection = 'UP_TO' | 'FROM';

function normalizedText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function serialDirections(notes: string | null | undefined): Set<SerialRuleDirection> {
  const text = normalizedText(notes || '');
  const directions = new Set<SerialRuleDirection>();
  if (!text) return directions;

  if (/(?:UP\s+TO|ATE)\s+(?:S\s*\/\s*N|SN|SERIAL(?:\s+NUMBER)?)\s*[:#.-]?\s*\d{6,16}\b/.test(text)
      || /(?:S\s*\/\s*N|SN|SERIAL(?:\s+NUMBER)?)\s*[:#.-]?\s*\d{6,16}\s+(?:AND\s+)?(?:BELOW|DOWN)\b/.test(text)) {
    directions.add('UP_TO');
  }
  if (/(?:FROM|A\s+PARTIR\s+DE)\s+(?:S\s*\/\s*N|SN|SERIAL(?:\s+NUMBER)?)\s*[:#.-]?\s*\d{6,16}\b/.test(text)
      || /(?:S\s*\/\s*N|SN|SERIAL(?:\s+NUMBER)?)\s*[:#.-]?\s*\d{6,16}\s+(?:AND\s+)?(?:UP|ABOVE)\b/.test(text)) {
    directions.add('FROM');
  }
  return directions;
}

function occurrenceKey(candidate: SerialGuidanceCandidate): string {
  return [
    normalizeIdentifier(candidate.pnc),
    normalizeIdentifier(candidate.section),
    normalizeIdentifier(candidate.position),
  ].join('|');
}

/**
 * Retorna true somente quando a própria lista de candidatos demonstra uma troca
 * de código por número de série no MESMO PNC/vista/posição. A regra não infere
 * faixas e não considera uma observação isolada suficiente para exigir serial.
 *
 * Se o usuário já informou S/N/serial explicitamente, esta função sempre retorna
 * false: a compatibilidade passa a ser decidida pelo serialApplicability do gate.
 */
export function requiresSerialConfirmation(
  question: string,
  candidates: SerialGuidanceCandidate[],
): boolean {
  if (extractExplicitSerialNumber(question)) return false;

  const groups = new Map<string, Array<{ code: string; directions: Set<SerialRuleDirection> }>>();
  for (const candidate of candidates) {
    const directions = serialDirections(candidate.notes);
    if (!directions.size) continue;
    const position = normalizeIdentifier(candidate.position);
    const section = normalizeIdentifier(candidate.section);
    // Sem posição/vista não é seguro concluir que duas regras pertencem ao mesmo item.
    if (!position || !section) continue;
    const key = occurrenceKey(candidate);
    const rows = groups.get(key) || [];
    rows.push({ code: normalizeIdentifier(candidate.partNumber), directions });
    groups.set(key, rows);
  }

  for (const rows of groups.values()) {
    const codes = new Set(rows.map(row => row.code).filter(Boolean));
    if (codes.size < 2) continue;
    const directions = new Set(rows.flatMap(row => [...row.directions]));
    // O padrão mais seguro é uma fronteira explícita: código antigo até uma série
    // e código novo a partir de outra série. Isso evita pedir S/N por nota isolada.
    if (directions.has('UP_TO') && directions.has('FROM')) return true;
  }

  return false;
}
