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
 * Mantém somente variantes destinadas ao mercado configurado (padrão Brasil/América Latina).
 * Se o catálogo possuir marcação compatível com a região, elimina candidatos restritos
 * a outros mercados conflitantes (ex: EU, USA) e dá preferência à versão regional.
 * Se o catálogo não possuir marcação regional, preserva os candidatos existentes.
 */
export function filterCandidatesByMarket<T extends MarketCandidate>(
  candidates: T[],
  preferredMarket = process.env.PARTS_MARKET || 'LATIN_AMERICA',
): T[] {
  if (!preferredMarket.trim()) return candidates;

  const hasAnyMarketMatch = candidates.some(candidate =>
    matchesMarket(candidateEvidence(candidate), preferredMarket),
  );
  if (!hasAnyMarketMatch) {
    return candidates;
  }

  // Se existe pelo menos um candidato compatível com o mercado preferido,
  // descarta candidatos que são explicitamente restritos a outros mercados conflitantes (ex: EU, USA).
  const withoutForeign = candidates.filter(candidate => {
    const evidence = candidateEvidence(candidate);
    if (isMarketSpecific(evidence) && !matchesMarket(evidence, preferredMarket)) {
      return false;
    }
    return true;
  });

  if (!withoutForeign.some(candidate => occurrenceKey(candidate))) {
    const matching = withoutForeign.filter(candidate =>
      matchesMarket(candidateEvidence(candidate), preferredMarket),
    );
    return matching.length ? matching : withoutForeign;
  }

  const groups = new Map<string, T[]>();
  for (const [index, candidate] of withoutForeign.entries()) {
    const key = occurrenceKey(candidate) || `__ungrouped__${index}`;
    groups.set(key, [...(groups.get(key) || []), candidate]);
  }

  const filtered: T[] = [];
  for (const group of groups.values()) {
    const matching = group.filter(candidate =>
      matchesMarket(candidateEvidence(candidate), preferredMarket),
    );
    const hasGeneric = group.some(candidate => !isMarketSpecific(candidateEvidence(candidate)));
    if (matching.length && hasGeneric) {
      filtered.push(...matching);
    } else {
      filtered.push(...group);
    }
  }

  return filtered;
}

