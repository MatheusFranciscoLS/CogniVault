import { normalizeText } from '../utils/normalize';

function normalizedMarket(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function candidateEvidence(candidate: { name?: string | null; notes: string | null }): string {
  return [candidate.name, candidate.notes].filter(Boolean).join(' ');
}

function isMarketSpecific(value: string): boolean {
  const normalized = normalizedMarket(value);
  return /\b(eu|europe|europa|asia|latin america|south america|latam|america latina|america do sul|usa|us|canada|can|australia|aus|new zealand|nova zelandia|nz)\b/.test(normalized);
}

function matchesMarket(evidence: string, market: string): boolean {
  const value = normalizedMarket(evidence);
  const preferred = normalizedMarket(market);
  if (['latin america', 'south america', 'latam', 'america latina', 'america do sul'].includes(preferred)) {
    return /\b(latin america|south america|latam|america latina|america do sul)\b/.test(value);
  }
  if (['europe', 'eu', 'europa'].includes(preferred)) return /\b(eu|europe|europa)\b/.test(value);
  if (preferred === 'asia') return /\basia\b/.test(value);
  return value.includes(preferred);
}

type MarketCandidate = {
  name?: string | null;
  notes: string | null;
  normalizedModel?: string | null;
  normalizedPnc?: string | null;
  universalAcrossPnc?: boolean;
  page?: number | null;
  section?: string | null;
  position?: string | null;
};

function occurrenceKey(candidate: MarketCandidate): string | null {
  if (!candidate.normalizedModel || !candidate.page || !candidate.position) return null;
  const pnc = candidate.universalAcrossPnc ? '*' : (candidate.normalizedPnc || '?');
  return [candidate.normalizedModel, pnc, candidate.page, normalizeText(candidate.section || ''), candidate.position].join('|');
}

/**
 * Mantém somente variantes explicitamente destinadas ao mercado configurado.
 * Se o catálogo não possuir marcação compatível, preserva todos os candidatos
 * para que a aplicação continue pedindo confirmação em vez de adivinhar.
 */
export function filterCandidatesByMarket<T extends MarketCandidate>(
  candidates: T[],
  preferredMarket = process.env.PARTS_MARKET || '',
): T[] {
  if (!preferredMarket.trim()) return candidates;
  if (!candidates.some(candidate => occurrenceKey(candidate))) {
    const matching = candidates.filter(candidate => matchesMarket(candidateEvidence(candidate), preferredMarket));
    const hasExplicitAlternative = candidates.some(candidate => isMarketSpecific(candidateEvidence(candidate)));
    return matching.length && hasExplicitAlternative ? matching : candidates;
  }
  const groups = new Map<string, T[]>();
  for (const [index, candidate] of candidates.entries()) {
    const key = occurrenceKey(candidate) || `__ungrouped__${index}`;
    groups.set(key, [...(groups.get(key) || []), candidate]);
  }

  const filtered: T[] = [];
  for (const group of groups.values()) {
    const matching = group.filter(candidate => matchesMarket(candidateEvidence(candidate), preferredMarket));
    const hasExplicitAlternative = group.some(candidate => isMarketSpecific(candidateEvidence(candidate)));
    filtered.push(...(matching.length && hasExplicitAlternative ? matching : group));
  }
  return filtered;
}
