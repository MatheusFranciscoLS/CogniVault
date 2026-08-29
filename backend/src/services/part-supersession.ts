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

export function getVerifiedSupersession(partNumber: string): VerifiedPartSupersession | null {
  return byPreviousNumber.get(normalizeIdentifier(partNumber)) || null;
}

export function resolveCurrentPartNumber(partNumber: string): string {
  return getVerifiedSupersession(partNumber)?.currentPartNumber || partNumber;
}

/**
 * Remove o código antigo somente quando o código atual também existe na base.
 * Assim a busca nunca inventa uma peça ausente do catálogo técnico.
 */
export function preferCurrentPartNumbers<T extends { partNumber: string; normalizedPartNumber: string }>(candidates: T[]): T[] {
  const available = new Set(candidates.map(candidate => candidate.normalizedPartNumber));
  return candidates.filter(candidate => {
    const replacement = getVerifiedSupersession(candidate.partNumber);
    return !replacement || !available.has(normalizeIdentifier(replacement.currentPartNumber));
  });
}
