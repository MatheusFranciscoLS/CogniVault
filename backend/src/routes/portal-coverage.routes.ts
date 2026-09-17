import { Router } from 'express';
import { authMiddleware, adminOnly, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { tenantOperationSingleFlight } from '../middleware/tenant-operation-single-flight.middleware';
import {
  buildBoundedPortalCoverage,
  portalCoverageRequestCacheState,
} from '../services/bounded-portal-coverage.service';
import { rankPortfolioCoverageGaps } from '../services/portfolio-coverage';

const router = Router();

router.post(
  '/admin/quality/portal-coverage',
  authMiddleware,
  adminOnly,
  tenantOperationSingleFlight('quality-portal-coverage'),
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({ error: 'Sessão inválida.' });
      return;
    }

    try {
      const portfolio = await buildBoundedPortalCoverage(authReq.user.tenantId, {
        limit: 8,
        concurrency: 2,
      });
      const cacheState = portalCoverageRequestCacheState(portfolio.portalCache);
      if (cacheState) res.set('X-CogniVault-Cache', cacheState);

      res.json({
        scope: 'BR_LOCAL',
        portalChecked: true,
        checkedCount: portfolio.checkedCount,
        checkedModels: portfolio.checkedModels,
        portalCache: portfolio.portalCache,
        total: portfolio.total,
        localIpl: portfolio.localIpl,
        portalIpl: portfolio.portalIpl,
        unverified: portfolio.unverified,
        covered: portfolio.covered,
        coverageRate: portfolio.coverageRate,
        gaps: rankPortfolioCoverageGaps(portfolio.items, 20),
      });
    } catch (error) {
      console.error('❌ Erro ao homologar cobertura no Portal BR:', error);
      res.status(502).json({
        error: 'Não foi possível concluir a homologação no Portal Husqvarna Brasil agora.',
      });
    }
  },
);

export default router;
