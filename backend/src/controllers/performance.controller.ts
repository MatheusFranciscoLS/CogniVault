import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { uploadConcurrencySnapshot } from '../middleware/upload-concurrency.middleware';
import { AssistantObservabilityService } from '../services/assistant-observability.service';
import { PortfolioCoverageService } from '../services/portfolio-coverage.service';
import { performanceSnapshot } from '../services/request-performance';

export class PerformanceController {
  async overview(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    try {
      const [assistant, portfolio] = await Promise.all([
        AssistantObservabilityService.snapshot(req.user.tenantId),
        PortfolioCoverageService.snapshot(req.user.tenantId),
      ]);
      res.status(200).json({
        performance: {
          ...performanceSnapshot(),
          uploads: uploadConcurrencySnapshot(),
          assistant,
          portfolio: {
            totalKnownModels: portfolio.totalKnownModels,
            localIplModels: portfolio.localIplModels,
            officialCachedModels: portfolio.officialCachedModels,
            uncoveredModels: portfolio.uncoveredModels,
            coveragePercent: portfolio.coveragePercent,
            gaps: portfolio.items
              .filter(item => item.coverage === 'UNVERIFIED')
              .slice(0, 40)
              .map(item => ({ model: item.model, sources: item.sources })),
          },
        },
      });
    } catch (error) {
      console.error('❌ Erro ao carregar observabilidade do assistente:', error);
      res.status(500).json({ error: 'Não foi possível carregar as métricas de desempenho agora.' });
    }
  }
}
