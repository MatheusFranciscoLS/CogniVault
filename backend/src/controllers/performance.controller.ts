import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { uploadConcurrencySnapshot } from '../middleware/upload-concurrency.middleware';
import { performanceSnapshot } from '../services/request-performance';

export class PerformanceController {
  overview(req: AuthenticatedRequest, res: Response): void {
    if (!req.user) return;
    res.status(200).json({
      performance: {
        ...performanceSnapshot(),
        uploads: uploadConcurrencySnapshot(),
      },
    });
  }
}
