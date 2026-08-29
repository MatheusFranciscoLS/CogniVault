export type PartBenchmarkCase = {
  id: string;
  query: string;
  model: string;
  pnc?: string;
  expectedPartNumbers: string[];
  source: string;
};

export type PartBenchmarkObservation = {
  caseId: string;
  returnedPartNumbers: string[];
};

export type PartBenchmarkMetrics = {
  total: number;
  top1Accuracy: number;
  recallAt5: number;
  mrr: number;
  ndcgAt5: number;
  missRate: number;
};

function normalizeCode(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function firstRelevantRank(expected: Set<string>, returned: string[]): number | null {
  const index = returned.findIndex(code => expected.has(normalizeCode(code)));
  return index >= 0 ? index + 1 : null;
}

/**
 * Métricas simples e reproduzíveis para o benchmark do balcão.
 * Cada caso pode aceitar mais de um Part Number quando o próprio catálogo mostra
 * equivalentes tecnicamente válidos. A avaliação nunca inventa relevância.
 */
export function evaluatePartBenchmark(
  cases: PartBenchmarkCase[],
  observations: PartBenchmarkObservation[],
): PartBenchmarkMetrics {
  if (!cases.length) {
    return { total: 0, top1Accuracy: 0, recallAt5: 0, mrr: 0, ndcgAt5: 0, missRate: 0 };
  }

  const byId = new Map(observations.map(observation => [observation.caseId, observation]));
  let top1Hits = 0;
  let top5Hits = 0;
  let reciprocalRank = 0;
  let ndcg = 0;
  let misses = 0;

  for (const benchmarkCase of cases) {
    const expected = new Set(benchmarkCase.expectedPartNumbers.map(normalizeCode));
    const returned = (byId.get(benchmarkCase.id)?.returnedPartNumbers || []).map(normalizeCode);
    const rank = firstRelevantRank(expected, returned);

    if (returned[0] && expected.has(returned[0])) top1Hits += 1;
    if (rank !== null && rank <= 5) top5Hits += 1;
    if (rank !== null) reciprocalRank += 1 / rank;
    else misses += 1;

    // Com relevância binária e pelo menos um código esperado, o DCG ideal do
    // primeiro acerto é 1. Assim NDCG@5 vira 1/log2(rank+1) para o primeiro acerto.
    if (rank !== null && rank <= 5) ndcg += 1 / Math.log2(rank + 1);
  }

  const total = cases.length;
  return {
    total,
    top1Accuracy: top1Hits / total,
    recallAt5: top5Hits / total,
    mrr: reciprocalRank / total,
    ndcgAt5: ndcg / total,
    missRate: misses / total,
  };
}

export function formatBenchmarkPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
