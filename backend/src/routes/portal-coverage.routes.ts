import { Router } from 'express';
import { authMiddleware, adminOnly, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { tenantOperationSingleFlight } from '../middleware/tenant-operation-single-flight.middleware';
import {
  buildBoundedPortalCoverage,
  portalCoverageRequestCacheState,
} from '../services/bounded-portal-coverage.service';
import { listNotApplicable, rankPortfolioCoverageGaps } from '../services/portfolio-coverage';
import { normalizeIdentifier } from '../utils/normalize';

const MAX_EXCLUDED_MODELS = 500;

/** Modelos que a tela já tentou nesta rodada; só serve para a próxima chamada não repetir. */
function parseExcludedModels(body: unknown): Set<string> {
  const raw = (body as { exclude?: unknown } | undefined)?.exclude;
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw
      .filter((item): item is string => typeof item === 'string' && item.length <= 80)
      .slice(0, MAX_EXCLUDED_MODELS)
      .map(item => normalizeIdentifier(item)),
  );
}

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
        exclude: parseExcludedModels(req.body),
      });
      const cacheState = portalCoverageRequestCacheState(portfolio.portalCache);
      if (cacheState) res.set('X-CogniVault-Cache', cacheState);

      res.json({
        scope: 'BR_LOCAL',
        portalChecked: true,
        checkedCount: portfolio.checkedCount,
        checkedModels: portfolio.checkedModels,
        remaining: portfolio.remaining,
        portalCache: portfolio.portalCache,
        total: portfolio.total,
        localIpl: portfolio.localIpl,
        portalIpl: portfolio.portalIpl,
        portalDocument: portfolio.portalDocument,
        notApplicable: portfolio.notApplicable,
        outOfLine: listNotApplicable(portfolio.items),
        unverified: portfolio.unverified,
        covered: portfolio.covered,
        coverageRate: portfolio.coverageRate,
        gaps: rankPortfolioCoverageGaps(portfolio.items, 120),
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
