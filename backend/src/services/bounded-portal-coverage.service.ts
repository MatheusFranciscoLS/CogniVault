import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import {
  buildOfficialSourceCacheKey,
  OfficialSourceCacheService,
  type OfficialSourceCacheState,
} from './official-source-cache.service';
import {
  buildPortfolioCoverage,
  listedPncsForModel,
  markNotInLine,
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
// Versão 2: passou a reconhecer o IPL em documento (PDF) do Portal.
// Versão 3: o título do produto deixou de ser reprovado por "(sem bateria e carregador)", "®" e litragem.
// Versão 4: tenta o nome comercial completo ("540i XP") e a troca número+letra ("750K" = "K750").
// Versão 5: máquina da lista vigente é consultada pelo PNC (exato) antes do nome, e o título casa com o modelo em qualquer ponto.
const PORTAL_COVERAGE_POLICY_VERSION = 5;
// A resposta do Portal sobre "esse modelo tem IPL?" muda em semanas, não em horas.
const PORTAL_COVERAGE_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const PORTAL_COVERAGE_STALE_MS = 30 * 24 * 60 * 60 * 1000;

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
  const document = audit.iplDocuments?.[0] ?? null;
  const documentOutcome = (pnc: string | null): PortalCoverageVerificationOutcome => ({
    state: 'DOCUMENT_ONLY',
    pnc,
    source: document?.url || `Portal Husqvarna · ${document?.title ?? 'IPL'}`,
    note: `O Portal tem o IPL deste modelo em documento (PDF): ${document?.title}. Abra e leia o código no desenho.`,
  });

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
    if (document) return documentOutcome(null);
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
    if (document) return documentOutcome(resolved.pnc);
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

function statusFromOutcome(outcome: PortalCoverageVerificationOutcome, current: PortfolioCoverageItem['status']): PortfolioCoverageItem['status'] {
  if (outcome.state === 'VERIFIED') return 'PORTAL_IPL';
  if (outcome.state === 'DOCUMENT_ONLY') return 'PORTAL_DOCUMENT';
  return current;
}

const OUTCOME_RANK: Record<PortalVerificationState, number> = {
  VERIFIED: 3,
  DOCUMENT_ONLY: 2,
  NO_IPL: 1,
  NO_EXACT_MATCH: 0,
  INCONCLUSIVE: 0,
  NOT_CHECKED: 0,
};

/**
 * Nomes que a lista comercial usa para o MESMO modelo e que valem uma segunda tentativa:
 * o modelo seguido de 1 a 3 letras ("540i" -> "540i XP"). Qualquer outra coisa é outro modelo.
 */
export function commercialNameAlternatives(model: string, evidence: string[]): string[] {
  const base = normalizeIdentifier(model);
  if (!base) return [];
  const found = new Set<string>();
  for (const text of evidence) {
    const key = normalizeIdentifier(text);
    if (key.length > base.length && key.length <= base.length + 3 && key.startsWith(base) && /^[A-Z]+$/.test(key.slice(base.length))) {
      found.add(text.replace(/\s+/g, ' ').trim());
    }
  }
  return [...found];
}

export async function resolvePortalCoverageOutcome(
  model: string,
  loader: PortalAuditLoader = auditPortalModel,
  alternatives: string[] = [],
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
      freshMs: PORTAL_COVERAGE_FRESH_MS,
      staleMs: PORTAL_COVERAGE_STALE_MS,
    },
    async () => {
      let best = portalAuditToCoverageOutcome(await loader(model));
      for (const alternative of alternatives.slice(0, 2)) {
        if (best.state === 'VERIFIED') break;
        const outcome = portalAuditToCoverageOutcome(await loader(alternative));
        if (OUTCOME_RANK[outcome.state] > OUTCOME_RANK[best.state]) best = outcome;
      }
      liveOutcome = best;

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

/**
 * Soma ao portfólio o que o Portal já respondeu antes (só lê o cache, nunca chama o
 * Portal). Sem isso, cada carga da tela começava do zero e o painel nunca refletia
 * o que já tinha sido conferido.
 */
export async function applyCachedPortalOutcomes(items: PortfolioCoverageItem[]): Promise<PortfolioCoverageItem[]> {
  const pending = items.filter(item => item.status === 'UNVERIFIED');
  if (!pending.length) return items;
  const cached = await OfficialSourceCacheService.peekMany<PortalCoverageVerificationOutcome>(
    pending.map(item => buildPortalCoverageCacheKey(item.model)),
  );
  if (!cached.size) return items;
  return items.map(item => {
    if (item.status !== 'UNVERIFIED') return item;
    const outcome = cached.get(buildPortalCoverageCacheKey(item.model));
    if (!outcome) return item;
    return {
      ...item,
      status: statusFromOutcome(outcome, item.status),
      source: outcome.state === 'VERIFIED' || outcome.state === 'DOCUMENT_ONLY' ? outcome.source : item.source,
      pnc: outcome.pnc || item.pnc,
      portalVerification: outcome.state,
      portalVerificationNote: outcome.note,
    };
  });
}

/** Modelos da lista vigente de máquinas da Husqvarna (vazio quando a lista ainda não foi importada). */
async function listedMachines(tenantId: string): Promise<Array<{ model: string; pnc: string }>> {
  return prisma.machineListing.findMany({ where: { tenantId }, select: { model: true, pnc: true }, take: 2000 });
}

/** O portfólio com o que o Portal já confirmou, sem nenhuma chamada nova ao Portal. */
export async function buildPortfolioCoverageWithPortalCache(tenantId: string) {
  const base = await buildPortfolioCoverage(tenantId);
  const merged = await applyCachedPortalOutcomes(base.items);
  return summarizePortfolioCoverage(markNotInLine(merged, (await listedMachines(tenantId)).map(entry => entry.model)));
}

export async function buildBoundedPortalCoverage(
  tenantId: string,
  options: { limit?: number; concurrency?: number; exclude?: ReadonlySet<string> } = {},
) {
  const listedRows = await listedMachines(tenantId);
  const listed = listedRows.map(entry => entry.model);
  const base = summarizePortfolioCoverage(markNotInLine(await applyCachedPortalOutcomes((await buildPortfolioCoverage(tenantId)).items), listed));
  const candidates = selectPortalVerificationCandidates(base.items, options.limit ?? 8, options.exclude);
  const resolved = await mapWithConcurrency(
    candidates,
    options.concurrency ?? 2,
    candidate => {
      const knownPncs = listedPncsForModel(listedRows, candidate.model);
      return resolvePortalCoverageOutcome(
        candidate.model,
        name => auditPortalModel(name, { knownPncs: name === candidate.model ? knownPncs : [] }),
        commercialNameAlternatives(candidate.model, candidate.commercialEvidence),
      );
    },
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
      status: statusFromOutcome(outcome, item.status),
      source: outcome.state === 'VERIFIED' || outcome.state === 'DOCUMENT_ONLY' ? outcome.source : item.source,
      pnc: outcome.pnc || item.pnc,
      portalVerification: outcome.state,
      portalVerificationNote: outcome.note,
    };
  });

  const finalItems = markNotInLine(items, listed);

  return {
    ...summarizePortfolioCoverage(finalItems),
    portalChecked: true,
    checkedModels: candidates.map(candidate => candidate.model),
    checkedCount: candidates.length,
    // O que ainda falta conferir depois desta rodada (sem contar o que já foi tentado e não fechou).
    remaining: selectPortalVerificationCandidates(
      finalItems,
      Number.MAX_SAFE_INTEGER,
      new Set([...(options.exclude ?? []), ...candidates.map(candidate => candidate.normalizedModel)]),
    ).length,
    portalCache: cacheStates,
  };
}
