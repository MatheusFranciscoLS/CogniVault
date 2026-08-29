export type RankedRetrievalItem = { id: string };

/**
 * Combina rankings de recuperadores com Reciprocal Rank Fusion (RRF).
 *
 * A busca lexical e a vetorial usam escalas incompatíveis (score textual vs.
 * distância de cosseno). RRF considera a posição relativa em cada lista, evitando
 * calibrar artificialmente essas escalas. Um item encontrado pelos dois métodos
 * recebe naturalmente mais evidência do que um item presente em apenas um deles.
 */
export function reciprocalRankFusionScores<T extends RankedRetrievalItem>(
  rankings: T[][],
  k = 60,
): Map<string, number> {
  const safeK = Number.isFinite(k) && k >= 1 ? k : 60;
  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    const seen = new Set<string>();
    ranking.forEach((item, index) => {
      if (!item.id || seen.has(item.id)) return;
      seen.add(item.id);
      const score = 1 / (safeK + index + 1);
      scores.set(item.id, (scores.get(item.id) || 0) + score);
    });
  }

  return scores;
}

export function normalizedReciprocalRankFusionScores<T extends RankedRetrievalItem>(
  rankings: T[][],
  k = 60,
): Map<string, number> {
  const scores = reciprocalRankFusionScores(rankings, k);
  const maxScore = Math.max(0, ...scores.values());
  if (!maxScore) return scores;
  return new Map([...scores].map(([id, score]) => [id, score / maxScore]));
}
