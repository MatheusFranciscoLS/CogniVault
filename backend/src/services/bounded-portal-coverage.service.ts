import { normalizeIdentifier } from '../utils/normalize';
import {
  buildOfficialSourceCacheKey,
  OfficialSourceCacheService,
  type OfficialSourceCacheState,
} from './official-source-cache.service';
import {
  buildPortfolioCoverage,
  summarizePortfolioCoverage,
  type PortalVerificationState,
  type PortfolioCoverageItem,
} from './portfolio-coverage';
import { selectPortalVerificationCandidates } from './portal-verification-candidates';
import {
  auditPortalModel,
  PORTAL_BR_SITE,
  type PortalModelAudit,
} from './portal-model-audit.service';

const PORTAL_COVERAGE_CACHE_SOURCE = 'HUSQVARNA_PORTAL';
const PORTAL_COVERAGE_CACHE_RESOURCE = 'PORTAL_BR_MODEL_COVERAGE';
const PORTAL_COVERAGE_POLICY_VERSION = 1;

export type PortalCoverageVerificationOutcome = {
  state: PortalVerificationState;
  pnc: string | null;
  source: string | null;
  note: string;
};

export type CachedPortalCoverageOutcome = {
  outcome: PortalCoverageVerificationOutcome;
  cacheState: OfficialSourceCacheState;
};

export type PortalCoverageCacheSummary = Record<OfficialSourceCacheState, number>;

type PortalAuditLoader = (model: string) => Promise<PortalModelAudit>;

export function portalAuditToCoverageOutcome(audit: PortalModelAudit): PortalCoverageVerificationOutcome {
  if (audit.searchResultCount === 0) {
    return audit.portalAvailableWhenSearchEmpty
      ? {
          state: 'NO_EXACT_MATCH',
          pnc: null,
          source: null,
          note: 'Consulta concluída no Portal BR, sem produto exato retornado.',
        }
      : {
          state: 'INCONCLUSIVE',
          pnc: null,
          source: null,
          note: 'O Portal BR não confirmou disponibilidade durante a consulta; nenhuma ausência de IPL foi inferida.',
        };
  }

  if (audit.exactProductCount === 0) {
    return {
      state: 'NO_EXACT_MATCH',
      pnc: null,
      source: null,
      note: 'O Portal BR respondeu, mas nenhum resultado corresponde exatamente ao modelo.',
    };
  }

  const verified = audit.products.find(product => product.detailResolved && (product.structuredPartCount || 0) > 0);
  if (verified) {
    return {
      state: 'VERIFIED',
      pnc: verified.pnc,
      source: verified.portalUrl || `Portal Husqvarna · ${verified.title}`,
      note: 'PNC confirmado no Portal BR com IPL contendo peças estruturadas.',
    };
  }

  const unresolved = audit.products.find(product => !product.detailResolved);
  if (unresolved) {
    return {
      state: 'INCONCLUSIVE',
      pnc: unresolved.pnc,
      source: null,
      note: 'Foi encontrado produto exato, mas ao menos uma consulta de detalhes não pôde ser confirmada. Nenhuma ausência de IPL foi inferida.',
    };
  }

  const resolved = audit.products.find(product => product.detailResolved);
  if (resolved) {
    return {
      state: 'NO_IPL',
      pnc: resolved.pnc,
      source: null,
      note: 'Produto exato confirmado no Portal BR, porém os detalhes retornados não continham IPL com peças estruturadas.',
    };
  }

  return {
    state: 'INCONCLUSIVE',
    pnc: null,
    source: null,
    note: 'A homologação no Portal BR não obteve detalhes suficientes para concluir a cobertura.',
  };
}

export function isCacheablePortalCoverageOutcome(outcome: PortalCoverageVerificationOutcome): boolean {
  return outcome.state !== 'INCONCLUSIVE';
}

export function portalCoverageRequestCacheState(
  cache: PortalCoverageCacheSummary,
): OfficialSourceCacheState | null {
  if (cache.FALLBACK > 0) return 'FALLBACK';
  if (cache.MISS > 0) return 'MISS';
  if (cache.STALE > 0) return 'STALE';
  if (cache.HIT > 0) return 'HIT';
  return null;
}

export function buildPortalCoverageCacheKey(model: string, site = PORTAL_BR_SITE): string {
  return buildOfficialSourceCacheKey(
    PORTAL_COVERAGE_CACHE_SOURCE,
    PORTAL_COVERAGE_CACHE_RESOURCE,
    {
      site,
      model: normalizeIdentifier(model),
      policyVersion: PORTAL_COVERAGE_POLICY_VERSION,
    },
  );
}

export async function resolvePortalCoverageOutcome(
  model: string,
  loader: PortalAuditLoader = auditPortalModel,
): Promise<CachedPortalCoverageOutcome> {
  const normalizedModel = normalizeIdentifier(model);
  const key = buildPortalCoverageCacheKey(normalizedModel);
  let liveOutcome: PortalCoverageVerificationOutcome | null = null;

  const cached = await OfficialSourceCacheService.get<PortalCoverageVerificationOutcome>(
    key,
    {
      source: PORTAL_COVERAGE_CACHE_SOURCE,
      resourceType: PORTAL_COVERAGE_CACHE_RESOURCE,
      resourceId: `${PORTAL_BR_SITE}:${normalizedModel}`,
    },
    async () => {
      const audit = await loader(model);
      liveOutcome = portalAuditToCoverageOutcome(audit);

      // INCONCLUSIVE representa indisponibilidade ou evidência insuficiente.
      // O resultado ainda é devolvido nesta execução, mas não vira verdade
      // persistida por horas/dias. Uma próxima ação manual tentará o Portal de novo.
      return isCacheablePortalCoverageOutcome(liveOutcome) ? liveOutcome : null;
    },
  );

  const outcome = cached.value ?? liveOutcome;
  if (outcome) {
    return { outcome, cacheState: cached.state };
  }

  // Salvaguarda defensiva: o loader normal sempre produz um resultado. Este
  // fallback mantém a regra conservadora se uma implementação futura não o fizer.
  return {
    outcome: {
      state: 'INCONCLUSIVE',
      pnc: null,
      source: null,
      note: 'A homologação no Portal BR não obteve evidência suficiente para concluir a cobertura.',
    },
    cacheState: cached.state,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const safeConcurrency = Number.isFinite(concurrency)
    ? Math.max(1, Math.min(4, Math.trunc(concurrency)))
    : 2;

  const runners = Array.from({ length: Math.max(1, Math.min(safeConcurrency, items.length || 1)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

export async function buildBoundedPortalCoverage(
  tenantId: string,
  options: { limit?: number; concurrency?: number } = {},
) {
  const base = await buildPortfolioCoverage(tenantId);
  const candidates = selectPortalVerificationCandidates(base.items, options.limit ?? 8);
  const resolved = await mapWithConcurrency(
    candidates,
    options.concurrency ?? 2,
    candidate => resolvePortalCoverageOutcome(candidate.model),
  );

  const outcomes = new Map(
    resolved.map((result, index) => [normalizeIdentifier(candidates[index].model), result.outcome]),
  );

  const cacheStates = resolved.reduce<PortalCoverageCacheSummary>(
    (summary, result) => {
      summary[result.cacheState] += 1;
      return summary;
    },
    { HIT: 0, STALE: 0, MISS: 0, FALLBACK: 0 },
  );

  const items: PortfolioCoverageItem[] = base.items.map(item => {
    const outcome = outcomes.get(item.normalizedModel);
    if (!outcome) return item;
    return {
      ...item,
      status: outcome.state === 'VERIFIED' ? 'PORTAL_IPL' : item.status,
      source: outcome.state === 'VERIFIED' ? outcome.source : item.source,
      pnc: outcome.pnc || item.pnc,
      portalVerification: outcome.state,
      portalVerificationNote: outcome.note,
    };
  });

  return {
    ...summarizePortfolioCoverage(items),
    portalChecked: true,
    checkedModels: candidates.map(candidate => candidate.model),
    checkedCount: candidates.length,
    portalCache: cacheStates,
  };
}
