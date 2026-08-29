import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { buildFallbackIntent } from './chat-reliability';
import { buildFeedbackBenchmarkCases } from './feedback-benchmark';
import { HUSQVARNA_GOLDEN_BENCHMARK } from './part-benchmark-cases';
import { evaluatePartBenchmark, type PartBenchmarkCase, type PartBenchmarkObservation } from './part-benchmark';
import { PartSearchService } from './part-search.service';
import { refreshCatalogHealth } from './catalog-health';

function code(value: string): string { return normalizeIdentifier(value); }

function percent(value: number): number { return Math.round(value * 10_000) / 100; }

export class AiQualityService {
  static async overview(tenantId: string) {
    const unchecked = await prisma.document.findMany({
      where: {
        tenantId,
        archivedAt: null,
        processingStage: { not: 'REMOVED' },
        status: 'COMPLETED',
        qualityCheckedAt: null,
      },
      take: 40,
      select: { id: true },
    });
    for (const document of unchecked) {
      try { await refreshCatalogHealth(document.id, tenantId); }
      catch (error) { console.warn('⚠️ Diagnóstico de catálogo pendente:', error instanceof Error ? error.message : error); }
    }

    const [documents, partCount, chunks, noEmbedding, noPage, noSection, archived, removed, latestRuns] = await Promise.all([
      prisma.document.findMany({
        where: { tenantId, archivedAt: null, processingStage: { not: 'REMOVED' } },
        orderBy: [{ reviewStatus: 'asc' }, { healthScore: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true, filename: true, manufacturer: true, model: true, pnc: true, status: true,
          processingStage: true, processingError: true, extractionMethod: true, extractedAt: true,
          healthScore: true, reviewStatus: true, reviewReasons: true, qualityCheckedAt: true,
          metadataReviewedAt: true, category: { select: { name: true } },
          _count: { select: { parts: { where: { active: true } }, chunks: true } },
        },
      }),
      prisma.part.count({ where: { active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED', processingStage: { not: 'REMOVED' } } } }),
      prisma.documentChunk.count({ where: { document: { tenantId, archivedAt: null, status: 'COMPLETED', processingStage: { not: 'REMOVED' } } } }),
      prisma.part.count({ where: { active: true, embeddingRevision: 0, document: { tenantId, archivedAt: null, status: 'COMPLETED', processingStage: { not: 'REMOVED' } } } }),
      prisma.part.count({ where: { active: true, page: null, document: { tenantId, archivedAt: null, status: 'COMPLETED', processingStage: { not: 'REMOVED' } } } }),
      prisma.part.count({ where: { active: true, section: null, document: { tenantId, archivedAt: null, status: 'COMPLETED', processingStage: { not: 'REMOVED' } } } }),
      prisma.document.count({ where: { tenantId, archivedAt: { not: null }, processingStage: { not: 'REMOVED' } } }),
      prisma.document.count({ where: { tenantId, processingStage: 'REMOVED' } }),
      prisma.aiBenchmarkRun.findMany({
        where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 10,
        select: { id: true, caseCount: true, metrics: true, details: true, createdAt: true },
      }),
    ]);

    const active = documents.filter(document => document.status === 'COMPLETED');
    const needsReview = documents.filter(document => document.reviewStatus === 'NEEDS_REVIEW' || document.reviewStatus === 'PENDING');
    const averageHealth = active.length
      ? Math.round(active.reduce((sum, document) => sum + document.healthScore, 0) / active.length)
      : 0;

    return {
      summary: {
        catalogs: documents.length,
        readyCatalogs: active.length,
        needsReview: needsReview.length,
        averageHealth,
        parts: partCount,
        technicalMemoryChunks: chunks,
        partsWithoutEmbedding: noEmbedding,
        partsWithoutPage: noPage,
        partsWithoutSection: noSection,
      },
      reviewQueue: needsReview,
      catalogs: documents,
      hygiene: {
        archivedRecords: archived,
        removedHistoricalRecords: removed,
        note: 'Diagnóstico limitado ao tenant atual. Nenhuma limpeza destrutiva é executada automaticamente.',
      },
      benchmarkRuns: latestRuns,
    };
  }

  private static async feedbackCases(tenantId: string): Promise<PartBenchmarkCase[]> {
    const rows = await prisma.searchFeedback.findMany({
      where: { tenantId, correct: false, correctedPartId: { not: null } },
      orderBy: { createdAt: 'desc' }, take: 150,
      select: {
        id: true, query: true, pnc: true,
        resultPart: { select: { partNumber: true, model: true, pnc: true } },
        correctedPart: { select: { partNumber: true, model: true, pnc: true } },
      },
    });
    return buildFeedbackBenchmarkCases(rows).slice(0, 50);
  }

  private static async classifyGoldenCoverage(tenantId: string, cases: PartBenchmarkCase[]) {
    const models = [...new Set(cases.map(item => normalizeIdentifier(item.model)).filter(Boolean))];
    const rows = await prisma.part.findMany({
      where: { normalizedModel: { in: models }, active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED', processingStage: { not: 'REMOVED' } } },
      select: { normalizedModel: true, normalizedPartNumber: true, normalizedPnc: true, universalAcrossPnc: true },
    });
    const modelsPresent = new Set(rows.map(row => row.normalizedModel));
    const applicable: PartBenchmarkCase[] = [];
    const missingCatalogs: PartBenchmarkCase[] = [];
    const extractionGaps: PartBenchmarkCase[] = [];

    for (const benchmarkCase of cases) {
      const model = normalizeIdentifier(benchmarkCase.model);
      if (!modelsPresent.has(model)) {
        missingCatalogs.push(benchmarkCase);
        continue;
      }
      const expected = new Set(benchmarkCase.expectedPartNumbers.map(code));
      const requestedPnc = normalizeIdentifier(benchmarkCase.pnc);
      const hasExpected = rows.some(row => row.normalizedModel === model
        && expected.has(row.normalizedPartNumber)
        && (!requestedPnc || row.universalAcrossPnc || row.normalizedPnc === requestedPnc));
      if (hasExpected) applicable.push(benchmarkCase);
      else extractionGaps.push(benchmarkCase);
    }
    return { applicable, missingCatalogs, extractionGaps };
  }

  static async runBenchmark(tenantId: string, userId: string) {
    const coverage = await this.classifyGoldenCoverage(tenantId, HUSQVARNA_GOLDEN_BENCHMARK);
    const feedbackCases = await this.feedbackCases(tenantId);
    const cases = [...coverage.applicable, ...feedbackCases];
    const observations: PartBenchmarkObservation[] = [];
    const failures: Array<{ id: string; query: string; expected: string[]; returned: string[]; hardNegatives: string[] }> = [];

    for (const benchmarkCase of cases) {
      const fallback = buildFallbackIntent(benchmarkCase.query);
      const intent = { ...fallback, model: benchmarkCase.model || fallback.model, pnc: benchmarkCase.pnc || fallback.pnc };
      const candidates = await PartSearchService.semantic(tenantId, benchmarkCase.query, intent);
      const returnedPartNumbers = candidates.slice(0, 10).map(candidate => candidate.partNumber);
      observations.push({ caseId: benchmarkCase.id, returnedPartNumbers });
      const expected = new Set(benchmarkCase.expectedPartNumbers.map(code));
      if (!returnedPartNumbers[0] || !expected.has(code(returnedPartNumbers[0]))) {
        failures.push({
          id: benchmarkCase.id,
          query: benchmarkCase.query,
          expected: benchmarkCase.expectedPartNumbers,
          returned: returnedPartNumbers.slice(0, 5),
          hardNegatives: benchmarkCase.hardNegativePartNumbers || [],
        });
      }
    }

    const metrics = evaluatePartBenchmark(cases, observations);
    const publicMetrics = {
      ...metrics,
      top1Percent: percent(metrics.top1Accuracy),
      recallAt5Percent: percent(metrics.recallAt5),
      missPercent: percent(metrics.missRate),
      hardNegativeWinPercent: percent(metrics.hardNegativeWinRate),
      goldenTotal: HUSQVARNA_GOLDEN_BENCHMARK.length,
      goldenApplicable: coverage.applicable.length,
      feedbackCases: feedbackCases.length,
      catalogCoveragePercent: HUSQVARNA_GOLDEN_BENCHMARK.length
        ? percent(coverage.applicable.length / HUSQVARNA_GOLDEN_BENCHMARK.length)
        : 0,
      extractionGaps: coverage.extractionGaps.length,
      missingCatalogs: coverage.missingCatalogs.length,
    };
    const details = {
      failures,
      observations,
      missingCatalogs: coverage.missingCatalogs.map(item => ({ id: item.id, model: item.model, query: item.query, source: item.source })),
      extractionGaps: coverage.extractionGaps.map(item => ({ id: item.id, model: item.model, query: item.query, expected: item.expectedPartNumbers, source: item.source })),
    };
    const run = await prisma.aiBenchmarkRun.create({
      data: { tenantId, userId, caseCount: cases.length, metrics: publicMetrics, details },
      select: { id: true, caseCount: true, metrics: true, details: true, createdAt: true },
    });
    return run;
  }
}
