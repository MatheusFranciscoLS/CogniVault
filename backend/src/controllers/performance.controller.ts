import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { uploadConcurrencySnapshot } from '../middleware/upload-concurrency.middleware';
import { AssistantObservabilityService } from '../services/assistant-observability.service';
import { performanceSnapshot } from '../services/request-performance';

export class PerformanceController {
  async overview(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    try {
      const assistant = await AssistantObservabilityService.snapshot(req.user.tenantId);
      res.status(200).json({
        performance: {
          ...performanceSnapshot(),
          uploads: uploadConcurrencySnapshot(),
          assistant,
        },
      });
    } catch (error) {
      console.error('❌ Erro ao carregar observabilidade do assistente:', error);
      res.status(500).json({ error: 'Não foi possível carregar as métricas de desempenho agora.' });
    }
  }
}
