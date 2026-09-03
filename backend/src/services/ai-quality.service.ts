import { GEMINI_GENERATIVE_MODEL } from '../config/gemini';
import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { buildFallbackIntent } from './chat-reliability';
import { buildFeedbackBenchmarkCases } from './feedback-benchmark';
import { HUSQVARNA_GOLDEN_BENCHMARK } from './part-benchmark-cases';
import { evaluatePartBenchmark, type PartBenchmarkCase, type PartBenchmarkObservation } from './part-benchmark';
import { PartSearchService } from './part-search.service';
import { refreshCatalogHealth } from './catalog-health';
import { inferCatalogModelFromFilename, isLikelyHusqvarnaPnc, isPlausibleCatalogModel } from './catalog-extractor';
import { buildSearchQualityRadar } from './search-quality-radar';
import { officialVerificationCacheDays } from './official-part-verification.service';
import { semanticIndexStatus } from './semantic-index-maintenance.service';
import { visualCatalogRetryStatus } from './visual-catalog-retry.service';

function code(value: string): string { return normalizeIdentifier(value); }

function percent(value: number): number { return Math.round(value * 10_000) / 100; }

// Registros históricos de desenvolvimento sem PDF processado, metadado ou peça.
// Eles permanecem no banco/auditoria, porém não podem reduzir artificialmente a
// saúde da biblioteca nem aparecer como catálogos que exigem revisão técnica.
const LEGACY_EMPTY_DOCUMENT = {
  status: 'COMPLETED',
  processingStage: 'IDLE',
  extractionMethod: null,
  manufacturer: null,
  model: null,
  pnc: null,
  parts: { none: { active: true } },
} as const;

export class AiQualityService {
  static async overview(tenantId: string) {
    const unchecked = await prisma.document.findMany({
      where: {
        tenantId,
        archivedAt: null,
        processingStage: { not: 'REMOVED' },
        status: 'COMPLETED',
        qualityCheckedAt: null,
        NOT: LEGACY_EMPTY_DOCUMENT,
      },
      take: 40,
      select: { id: true },
    });
    if (unchecked.length > 0) {
      const BATCH_SIZE = 6;
      for (let i = 0; i < unchecked.length; i += BATCH_SIZE) {
        const batch = unchecked.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
          batch.map(document => refreshCatalogHealth(document.id, tenantId).catch(error => {
            console.warn('⚠️ Diagnóstico de catálogo pendente:', error instanceof Error ? error.message : error);
          }))
        );
      }
    }

    const [documents, partCount, chunks, noEmbedding, noPage, noSection, archived, removed, legacyEmpty, latestRuns, searchHistory] = await Promise.all([
      prisma.document.findMany({
        where: {
          tenantId,
          archivedAt: null,
          processingStage: { not: 'REMOVED' },
          NOT: LEGACY_EMPTY_DOCUMENT,
        },
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
      prisma.document.count({ where: { tenantId, archivedAt: null, ...LEGACY_EMPTY_DOCUMENT } }),
      prisma.aiBenchmarkRun.findMany({
        where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 10,
        select: { id: true, caseCount: true, metrics: true, details: true, createdAt: true },
      }),
      prisma.searchHistory.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 300,
        select: { query: true, pnc: true, status: true, createdAt: true },
      }),
    ]);

    const pncRows = await prisma.part.findMany({
      where: {
        active: true,
        pnc: { not: null },
        document: { tenantId, archivedAt: null, status: 'COMPLETED', processingStage: { not: 'REMOVED' } },
      },
      distinct: ['documentId', 'pnc'],
      select: { documentId: true, pnc: true },
    });
    const documentsWithConfirmedPnc = new Set(pncRows.filter(row => isLikelyHusqvarnaPnc(row.pnc)).map(row => row.documentId));
    const effectiveDocuments = documents.map(document => {
      const modelNeedsReview = document.status === 'COMPLETED' && !isPlausibleCatalogModel(document.model);
      const suggestedModel = modelNeedsReview ? inferCatalogModelFromFilename(document.filename) || null : null;
      const modelReason = suggestedModel
        ? `Modelo atual não é confiável. Sugestão pelo nome do arquivo: ${suggestedModel}.`
        : 'Modelo atual não é confiável e precisa ser confirmado no PDF.';
      return {
        ...document,
        modelNeedsReview,
        suggestedModel,
        healthScore: modelNeedsReview ? Math.min(document.healthScore, 64) : document.healthScore,
        reviewStatus: modelNeedsReview ? 'NEEDS_REVIEW' as const : document.reviewStatus,
        reviewReasons: modelNeedsReview && !document.reviewReasons.includes(modelReason)
          ? [modelReason, ...document.reviewReasons]
          : document.reviewReasons,
      };
    });
    const active = effectiveDocuments.filter(document => document.status === 'COMPLETED');
    const needsReview = effectiveDocuments.filter(document => document.reviewStatus === 'NEEDS_REVIEW' || document.reviewStatus === 'PENDING');
    const averageHealth = active.length
      ? Math.round(active.reduce((sum, document) => sum + document.healthScore, 0) / active.length)
      : 0;
    const geminiCatalogs = active.filter(document => document.extractionMethod?.toUpperCase().startsWith('GEMINI')).length;
    const parserCatalogs = active.filter(document => document.extractionMethod && !document.extractionMethod.toUpperCase().startsWith('GEMINI')).length;
    const unknownExtractionCatalogs = active.filter(document => !document.extractionMethod).length;
    const [semanticIndex, visualRetry, feedbackSignals, pendingOfficial, approvedOfficial, staleOfficial] = await Promise.all([
      semanticIndexStatus(tenantId),
      visualCatalogRetryStatus(tenantId),
      prisma.searchFeedback.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: {
          userId: true, normalizedQuery: true, resultPartId: true, correctedPartId: true,
          correct: true, createdAt: true,
        },
      }),
      prisma.officialPartVerification.count({ where: { tenantId, approvalStatus: 'PENDING' } }),
      prisma.officialPartVerification.count({ where: { tenantId, approvalStatus: 'APPROVED' } }),
      prisma.officialPartVerification.count({
        where: {
          tenantId,
          approvalStatus: 'APPROVED',
          verifiedAt: { lt: new Date(Date.now() - officialVerificationCacheDays() * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);
    const uniqueFeedbackSignals = new Set(feedbackSignals.map((signal, index) => [
      signal.userId || `legacy:${index}`,
      signal.normalizedQuery,
      signal.resultPartId,
      signal.correctedPartId || '',
      signal.correct ? '1' : '0',
    ].join('|'))).size;
    const correctedFeedback = feedbackSignals.filter(signal => !signal.correct && signal.correctedPartId).length;
    const positiveFeedback = feedbackSignals.filter(signal => signal.correct).length;
    const learningLevel = uniqueFeedbackSignals >= 20 ? 'ESTABLISHED' : uniqueFeedbackSignals >= 5 ? 'LEARNING' : 'COLD_START';

    return {
      summary: {
        catalogs: documents.length,
        readyCatalogs: active.length,
        needsReview: needsReview.length,
        averageHealth,
        parts: partCount,
        technicalMemoryChunks: chunks,
        modelIssues: active.filter(document => document.modelNeedsReview).length,
        catalogsWithoutConfirmedPnc: active.filter(document => !isLikelyHusqvarnaPnc(document.pnc) && !documentsWithConfirmedPnc.has(document.id)).length,
        partsWithoutEmbedding: noEmbedding,
        partsWithoutPage: noPage,
        partsWithoutSection: noSection,
      },
      runtime: {
        generativeModel: GEMINI_GENERATIVE_MODEL,
        extraction: {
          geminiCatalogs,
          parserCatalogs,
          unknownCatalogs: unknownExtractionCatalogs,
        },
      },
      learning: {
        total: feedbackSignals.length,
        uniqueSignals: uniqueFeedbackSignals,
        positive: positiveFeedback,
        corrected: correctedFeedback,
        negativeWithoutCorrection: feedbackSignals.length - positiveFeedback - correctedFeedback,
        level: learningLevel,
        nextMilestone: learningLevel === 'COLD_START' ? 5 : learningLevel === 'LEARNING' ? 20 : null,
      },
      semanticIndex,
      visualRetry,
      officialVerification: {
        approved: approvedOfficial,
        pending: pendingOfficial,
        stale: staleOfficial,
        cacheDays: officialVerificationCacheDays(),
      },
      searchRadar: buildSearchQualityRadar(searchHistory, 10),
      reviewQueue: needsReview,
      catalogs: effectiveDocuments,
      hygiene: {
        archivedRecords: archived,
        removedHistoricalRecords: removed,
        legacyEmptyRecords: legacyEmpty,
        note: 'Registros legados vazios ficam preservados para auditoria, mas são ocultados da biblioteca e das métricas técnicas. Nenhuma limpeza destrutiva é executada automaticamente.',
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
