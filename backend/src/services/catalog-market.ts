import { normalizeText } from '../utils/normalize';

function normalizedMarket(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function isMarketSpecific(notes: string): boolean {
  const value = normalizedMarket(notes);
  return /\b(eu|europe|asia|latin america|latam|america latina|usa|us|canada|can|australia|aus|new zealand|nz)\b/.test(value);
}

function matchesMarket(notes: string, market: string): boolean {
  const value = normalizedMarket(notes);
  const preferred = normalizedMarket(market);
  if (['latin america', 'latam', 'america latina'].includes(preferred)) {
    return /\b(latin america|latam|america latina)\b/.test(value);
  }
  if (['europe', 'eu', 'europa'].includes(preferred)) return /\b(eu|europe|europa)\b/.test(value);
  if (preferred === 'asia') return /\basia\b/.test(value);
  return value.includes(preferred);
}

/**
 * Mantém somente variantes explicitamente destinadas ao mercado configurado.
 * Se o catálogo não possuir marcação compatível, preserva todos os candidatos
 * para que a aplicação continue pedindo confirmação em vez de adivinhar.
 */
export function filterCandidatesByMarket<T extends { notes: string | null }>(
  candidates: T[],
  preferredMarket = process.env.PARTS_MARKET || '',
): T[] {
  if (!preferredMarket.trim()) return candidates;
  const matching = candidates.filter(candidate => candidate.notes && matchesMarket(candidate.notes, preferredMarket));
  if (!matching.length) return candidates;

  const hasExplicitAlternatives = candidates.some(candidate => candidate.notes && isMarketSpecific(candidate.notes));
  return hasExplicitAlternatives ? matching : candidates;
}
