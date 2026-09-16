import 'dotenv/config';
import { prisma } from '../config/prisma';
import { buildFallbackIntent } from '../services/chat-reliability';
import { buildFeedbackBenchmarkCases } from '../services/feedback-benchmark';
import { HUSQVARNA_CRITICAL_BENCHMARK } from '../services/part-benchmark-cases';
import { benchmarkCoverageByFamily, buildCatalogBenchmarkCases } from '../services/catalog-benchmark';
import { evaluatePartBenchmark, formatBenchmarkPercent, type PartBenchmarkCase } from '../services/part-benchmark';
import { PartSearchService } from '../services/part-search.service';

function argValue(name: string): string {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length).trim() || '';
}

function enabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value || '').trim().toLowerCase());
}

function normalized(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

async function feedbackCases(tenantId: string) {
  const includeFeedback = process.argv.includes('--include-feedback') || enabled(process.env.BENCHMARK_INCLUDE_FEEDBACK);
  if (!includeFeedback) return [];

  const requestedLimit = Number(argValue('feedback-limit') || process.env.BENCHMARK_FEEDBACK_LIMIT || '50');
  const feedbackLimit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(200, Math.trunc(requestedLimit))) : 50;
  const rows = await prisma.searchFeedback.findMany({
    where: { tenantId, correct: false, correctedPartId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: feedbackLimit * 3,
    select: {
      id: true,
      query: true,
      pnc: true,
      resultPart: { select: { partNumber: true, model: true, pnc: true } },
      correctedPart: { select: { partNumber: true, model: true, pnc: true } },
    },
  });

  return buildFeedbackBenchmarkCases(rows).slice(0, feedbackLimit).map(item => ({
    ...item,
    family: item.family || 'Correções reais',
    queryType: item.queryType || 'FEEDBACK' as const,
  }));
}

function uniqueCases(items: PartBenchmarkCase[]): PartBenchmarkCase[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${normalized(item.model)}|${normalized(item.pnc || '')}|${item.expectedPartNumbers.map(normalized).sort().join(',')}|${item.query.trim().toLocaleLowerCase('pt-BR')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const tenantId = argValue('tenant') || process.env.BENCHMARK_TENANT_ID || '';
  if (!tenantId) {
    throw new Error('Informe --tenant=<tenantId> ou BENCHMARK_TENANT_ID para executar o benchmark contra o catálogo importado.');
  }

  const portfolio = process.argv.includes('--portfolio') || enabled(process.env.BENCHMARK_PORTFOLIO);
  const full = !portfolio && (process.argv.includes('--full') || enabled(process.env.BENCHMARK_FULL));
  const defaultTarget = portfolio ? 10_000 : full ? 500 : 50;
  const maxTarget = portfolio ? 10_000 : 500;
  const requestedTarget = Number(argValue('limit') || process.env.BENCHMARK_CASE_LIMIT || String(defaultTarget));
  const target = Number.isFinite(requestedTarget)
    ? Math.max(1, Math.min(maxTarget, Math.trunc(requestedTarget)))
    : defaultTarget;

  const catalogCases = await buildCatalogBenchmarkCases(tenantId, target);
  const coreCases = uniqueCases([...HUSQVARNA_CRITICAL_BENCHMARK, ...catalogCases]).slice(0, target);
  const tenantFeedbackCases = await feedbackCases(tenantId);
  const cases = [...coreCases, ...tenantFeedbackCases];
  const observations = [];

  console.log(`\n🧪 CogniVault benchmark: ${cases.length} casos`);
  console.log(`   Cobertura principal: ${coreCases.length}/${target} · críticos curados: ${HUSQVARNA_CRITICAL_BENCHMARK.length} · correções reais: ${tenantFeedbackCases.length}`);
  console.log(`   Modo: ${portfolio ? 'PORTFOLIO (até 10.000 casos únicos)' : full ? 'REGRESSÃO AMPLA (até 500)' : 'CRÍTICO/SMOKE (até 50)'}`);
  console.log('   Gemini: não utilizado pelo benchmark de recuperação');
  console.log('   Métricas: Top-1, Recall@5, MRR, NDCG@5 e hard negatives\n');

  const coverage = benchmarkCoverageByFamily(coreCases);
  console.log('📚 Cobertura por família:');
  for (const item of coverage) console.log(`   ${item.family}: ${item.count}`);
  console.log('');

  for (const [index, benchmarkCase] of cases.entries()) {
    const fallback = buildFallbackIntent(benchmarkCase.query);
    const intent = { ...fallback, model: benchmarkCase.model || fallback.model, pnc: benchmarkCase.pnc || fallback.pnc };
    const candidates = await PartSearchService.semantic(tenantId, benchmarkCase.query, intent);
    const returnedPartNumbers = candidates.slice(0, 10).map(candidate => candidate.partNumber);
    observations.push({ caseId: benchmarkCase.id, returnedPartNumbers });

    const expected = new Set(benchmarkCase.expectedPartNumbers.map(normalized));
    const hardNegatives = new Set((benchmarkCase.hardNegativePartNumbers || []).map(normalized));
    const normalizedReturned = returnedPartNumbers.map(normalized);
    const top = normalizedReturned[0] || '';
    const correctRank = normalizedReturned.findIndex(code => expected.has(code));
    const hardRank = normalizedReturned.findIndex(code => hardNegatives.has(code));
    const hitAt5 = correctRank >= 0 && correctRank < 5;
    const hardNegativeWon = hardRank >= 0 && (correctRank < 0 || hardRank < correctRank);
    const status = hardNegativeWon ? '🛑 Hard negative venceu' : expected.has(top) ? '✅ Top-1' : hitAt5 ? '🟡 Top-5' : '❌ Falhou';

    console.log(`${String(index + 1).padStart(4, '0')}. ${status} · ${benchmarkCase.id} · ${benchmarkCase.family || 'sem família'}`);
    console.log(`      ${benchmarkCase.query}`);
    console.log(`      esperado: ${benchmarkCase.expectedPartNumbers.join(' / ')} · retornado: ${returnedPartNumbers.slice(0, 5).join(', ') || 'nenhum'}`);
  }

  const metrics = evaluatePartBenchmark(cases, observations);
  console.log('\n📊 Resultado');
  console.log(`   Top-1:                 ${formatBenchmarkPercent(metrics.top1Accuracy)}`);
  console.log(`   Recall@5:              ${formatBenchmarkPercent(metrics.recallAt5)}`);
  console.log(`   MRR:                   ${metrics.mrr.toFixed(3)}`);
  console.log(`   NDCG@5:                ${metrics.ndcgAt5.toFixed(3)}`);
  console.log(`   Miss rate:             ${formatBenchmarkPercent(metrics.missRate)}`);
  console.log(`   Hard negative Top-1:   ${formatBenchmarkPercent(metrics.hardNegativeTop1Rate)} (${metrics.hardNegativeCases} casos)`);
  console.log(`   Hard negative venceu:  ${formatBenchmarkPercent(metrics.hardNegativeWinRate)}\n`);

  const strict = process.argv.includes('--strict') || enabled(process.env.BENCHMARK_STRICT);
  if (strict) {
    const minTop1 = Number(process.env.BENCHMARK_MIN_TOP1 || '0.75');
    const minRecall5 = Number(process.env.BENCHMARK_MIN_RECALL5 || '0.90');
    const minMrr = Number(process.env.BENCHMARK_MIN_MRR || '0.80');
    const maxHardNegativeWinRate = Number(process.env.BENCHMARK_MAX_HARD_NEGATIVE_WIN_RATE || '0.10');
    if (metrics.top1Accuracy < minTop1 || metrics.recallAt5 < minRecall5 || metrics.mrr < minMrr || metrics.hardNegativeWinRate > maxHardNegativeWinRate) {
      process.exitCode = 2;
      console.error(`Regression gate falhou. Mínimos: Top-1 ${minTop1}, Recall@5 ${minRecall5}, MRR ${minMrr}; máximo hard-negative-win ${maxHardNegativeWinRate}.`);
    }
  }
}

main()
  .catch(error => {
    console.error('❌ Benchmark não executado:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
