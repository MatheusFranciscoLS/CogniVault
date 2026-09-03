import { normalizeIdentifier } from '../utils/normalize';

export interface VerifiedPartSupersession {
  previousPartNumber: string;
  currentPartNumber: string;
  sourceUrl: string;
  verifiedAt: string;
}

/**
 * Substituições confirmadas no portal oficial Husqvarna Brasil.
 * Não inferir cadeias apenas pelo PDF: cada entrada precisa de fonte oficial.
 */
export const VERIFIED_PART_SUPERSESSIONS: VerifiedPartSupersession[] = [
  {
    previousPartNumber: '586931401',
    currentPartNumber: '587106701',
    sourceUrl: 'https://portal.husqvarnagroup.com/br/spare-parts/?part=587106701',
    verifiedAt: '2026-08-28',
  },
];

const byPreviousNumber = new Map(
  VERIFIED_PART_SUPERSESSIONS.map(item => [normalizeIdentifier(item.previousPartNumber), item]),
);

const byCurrentNumber = new Map(
  VERIFIED_PART_SUPERSESSIONS.map(item => [normalizeIdentifier(item.currentPartNumber), item]),
);

export function getVerifiedSupersession(partNumber: string): VerifiedPartSupersession | null {
  return byPreviousNumber.get(normalizeIdentifier(partNumber)) || null;
}

export function getSupersededByCurrentNumber(currentPartNumber: string): VerifiedPartSupersession | null {
  return byCurrentNumber.get(normalizeIdentifier(currentPartNumber)) || null;
}

export function allRelatedPartNumbers(partNumber: string): string[] {
  const norm = normalizeIdentifier(partNumber);
  if (!norm) return [];
  const results = new Set<string>([partNumber]);

  const fwd = byPreviousNumber.get(norm);
  if (fwd) {
    results.add(fwd.currentPartNumber);
  }

  const rev = byCurrentNumber.get(norm);
  if (rev) {
    results.add(rev.previousPartNumber);
  }

  return [...results];
}

export function resolveCurrentPartNumber(partNumber: string): string {
  return getVerifiedSupersession(partNumber)?.currentPartNumber || partNumber;
}

/**
 * Remove o código antigo se o código atual já estiver na lista de candidatos.
 * Se apenas o código antigo estiver presente no catálogo, atualiza o partNumber para o código atual
 * oficial e registra a substituição oficial nas notas da peça.
 */
export function preferCurrentPartNumbers<T extends { partNumber: string; normalizedPartNumber: string; notes?: string | null }>(
  candidates: T[],
): T[] {
  const available = new Set(candidates.map(candidate => candidate.normalizedPartNumber));
  return candidates
    .filter(candidate => {
      const replacement = getVerifiedSupersession(candidate.partNumber);
      return !replacement || !available.has(normalizeIdentifier(replacement.currentPartNumber));
    })
    .map(candidate => {
      const replacement = getVerifiedSupersession(candidate.partNumber);
      if (!replacement) return candidate;

      const noteAddition = `Substituição oficial: ${replacement.previousPartNumber} → ${replacement.currentPartNumber} (portal Husqvarna Brasil)`;
      const currentNotes = candidate.notes || '';
      const notes = currentNotes.includes(replacement.currentPartNumber)
        ? currentNotes
        : [currentNotes, noteAddition].filter(Boolean).join(' · ');

      return {
        ...candidate,
        partNumber: replacement.currentPartNumber,
        normalizedPartNumber: normalizeIdentifier(replacement.currentPartNumber),
        notes,
      };
    });
}

