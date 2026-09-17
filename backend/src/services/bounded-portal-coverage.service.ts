import { normalizeIdentifier } from '../utils/normalize';
import {
  buildPortfolioCoverage,
  summarizePortfolioCoverage,
  type PortalVerificationState,
  type PortfolioCoverageItem,
} from './portfolio-coverage';
import { selectPortalVerificationCandidates } from './portal-verification-candidates';
import {
  auditPortalModels,
  type PortalModelAudit,
} from './portal-model-audit.service';

export type PortalCoverageVerificationOutcome = {
  state: PortalVerificationState;
  pnc: string | null;
  source: string | null;
  note: string;
};

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

export async function buildBoundedPortalCoverage(
  tenantId: string,
  options: { limit?: number; concurrency?: number } = {},
) {
  const base = await buildPortfolioCoverage(tenantId);
  const candidates = selectPortalVerificationCandidates(base.items, options.limit ?? 8);
  const audits = await auditPortalModels(
    candidates.map(candidate => candidate.model),
    options.concurrency ?? 2,
  );

  const outcomes = new Map(
    audits.map(audit => [normalizeIdentifier(audit.model), portalAuditToCoverageOutcome(audit)]),
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
  };
}
