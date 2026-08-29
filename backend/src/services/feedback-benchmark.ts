import type { PartBenchmarkCase } from './part-benchmark';

export type CorrectedFeedbackBenchmarkRow = {
  id: string;
  query: string;
  pnc?: string | null;
  resultPart: { partNumber: string; model: string; pnc?: string | null };
  correctedPart: { partNumber: string; model: string; pnc?: string | null } | null;
};

function normalizeCode(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

/**
 * Converte correções reais do balcão em regressões reproduzíveis.
 *
 * A peça corrigida vira resposta esperada e a peça que recebeu feedback negativo
 * vira hard negative. Não cria verdade nova: só usa uma correção explicitamente
 * registrada pelo usuário no próprio tenant.
 */
export function buildFeedbackBenchmarkCases(rows: CorrectedFeedbackBenchmarkRow[]): PartBenchmarkCase[] {
  const seen = new Set<string>();
  const cases: PartBenchmarkCase[] = [];

  for (const row of rows) {
    if (!row.correctedPart) continue;
    const expected = normalizeCode(row.correctedPart.partNumber);
    const wrong = normalizeCode(row.resultPart.partNumber);
    if (!expected || !wrong || expected === wrong) continue;

    const model = row.correctedPart.model || row.resultPart.model;
    const pnc = row.correctedPart.pnc || row.pnc || row.resultPart.pnc || undefined;
    const dedupeKey = [row.query.trim().toLowerCase(), model, pnc || '', expected, wrong].join('|');
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    cases.push({
      id: `feedback:${row.id}`,
      query: row.query,
      model,
      ...(pnc ? { pnc } : {}),
      expectedPartNumbers: [row.correctedPart.partNumber],
      hardNegativePartNumbers: [row.resultPart.partNumber],
      source: `Correção real do balcão (${row.id})`,
    });
  }

  return cases;
}
