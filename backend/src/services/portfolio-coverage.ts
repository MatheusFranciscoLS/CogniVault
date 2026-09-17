import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { HusqvarnaOfficialDetailService } from './husqvarna-official-detail.service';
import { HusqvarnaProductSearchService } from './husqvarna-product-search.service';

export type PortfolioCoverageStatus = 'LOCAL_IPL' | 'PORTAL_IPL' | 'UNVERIFIED';
export type PortalVerificationState = 'NOT_CHECKED' | 'VERIFIED' | 'NO_EXACT_MATCH' | 'NO_IPL' | 'INCONCLUSIVE';

export type PortfolioCoverageItem = {
  model: string;
  normalizedModel: string;
  status: PortfolioCoverageStatus;
  source: string | null;
  pnc: string | null;
  commercialSignals: number;
  commercialEvidence: string[];
  portalVerification?: PortalVerificationState;
  portalVerificationNote?: string | null;
};

type PortalVerificationOutcome = {
  state: PortalVerificationState;
  pnc: string | null;
  source: string | null;
  note: string;
};

type LocalCoverageRow = {
  model: string;
  normalizedModel: string;
  filename: string;
};

type CommercialApplicationRow = {
  application: string;
};

const NOISE_TOKENS = new Set([
  'HONDA', 'HUSQVARNA', 'BRIGGS', 'STRATTON', 'KAWASAKI', 'KOHLER', 'MOTOR', 'ENGINE',
]);

const PORTAL_GRAPHQL_URL = 'https://portal.husqvarnagroup.com/hbd/graphql?';
const PORTAL_ORIGIN = 'https://portal.husqvarnagroup.com';
const PORTAL_SITE = 'b2b-br-pt-br';
const PORTAL_PROBE_TIMEOUT_MS = 4_000;
const PORTAL_PROBE_TTL_MS = 30_000;

let portalProbeCache: { available: boolean; expiresAt: number } | null = null;
let portalProbePending: Promise<boolean> | null = null;

/**
 * Aplicações comerciais antigas usam bastante abreviação encadeada, por exemplo
 * `323R/LD/5/7LDx/HE/P5x`. Sem uma fonte técnica não é seguro reconstruir esses
 * fragmentos como `323LD`, `325...` etc. Para descoberta automática de cobertura,
 * só aceitamos tokens com formato forte de modelo completo. Modelos presentes em
 * IPL local entram no inventário independentemente desta heurística.
 */
export function hasStrongCommercialModelShape(value: string): boolean {
  const normalized = normalizeIdentifier(value);
  if (normalized.length < 4 || normalized.length > 24) return false;
  if (!/[A-Z]/i.test(normalized)) return false;
  const digitCount = (normalized.match(/\d/g) || []).length;
  return digitCount >= 2;
}

/**
 * Extrai modelos prováveis das aplicações comerciais. A lista comercial é usada
 * somente para descobrir o universo que merece cobertura; nunca como prova de
 * compatibilidade PNC/serial.
 */
export function extractCommercialModels(applicationInput: string): string[] {
  const application = String(applicationInput || '')
    .normalize('NFKC')
    .replace(/\b([A-Z]{1,3})\s+(\d{2,4}[A-Z][A-Z0-9_-]*)\b/gi, '$1$2')
    .replace(/\b(?:ROC|MS|MOTOSSERRA|ROCADEIRA|ROÇADEIRA|SOPRADOR|TRATOR|CORTADOR|PODADOR|ATOM|SPRAYER|PULVERIZADOR)\.?\s*/gi, ' ')
    .replace(/\b\d{1,2}\/\d{4}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const candidates = application
    .split(/[\/,;|]+|\s+E\s+/i)
    .flatMap(segment => segment.match(/\b[A-Z0-9][A-Z0-9._-]{1,23}\b/gi) || [])
    .map(value => value.replace(/^[._-]+|[._-]+$/g, ''))
    .filter(value => !/^\d{8,14}$/.test(normalizeIdentifier(value)))
    .filter(value => !NOISE_TOKENS.has(value.toUpperCase()))
    .filter(hasStrongCommercialModelShape);

  const unique = new Map<string, string>();
  for (const candidate of candidates) {
    const normalized = normalizeIdentifier(candidate);
    if (!unique.has(normalized)) unique.set(normalized, candidate);
  }
  return [...unique.values()];
}

function hasDistinctShortCodePrefix(title: string, modelKey: string): boolean {
  const tokens = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .match(/[A-Z0-9]+/g) || [];

  let suffix = '';
  let consumed = 0;
  for (let index = tokens.length - 1; index >= 0 && suffix.length < modelKey.length; index -= 1) {
    suffix = `${tokens[index]}${suffix}`;
    consumed += 1;
  }
  if (suffix !== modelKey) return false;

  const prefix = tokens[tokens.length - consumed - 1] || '';
  return /^[A-Z]{1,3}$/.test(prefix) && prefix !== 'HUSQVARNA';
}

/**
 * O Portal pode retornar famílias próximas para uma busca (ex.: 236, 236RS e 236R).
 * Cobertura técnica não pode promover um prefixo de modelo como prova do modelo pedido.
 * Também rejeitamos um código curto imediatamente anterior ao modelo solicitado
 * (ex.: `PW 235R` não comprova `235R`). A única equivalência textual deliberada é a
 * nomenclatura histórica `445 e-series` -> `445E` (e o mesmo padrão para outros
 * modelos terminados em E).
 */
export function portalResultMatchesModel(title: string, model: string): boolean {
  const titleKey = normalizeIdentifier(title);
  const modelKey = normalizeIdentifier(model);
  if (!titleKey || !modelKey) return false;
  if (titleKey.endsWith(modelKey) && !hasDistinctShortCodePrefix(title, modelKey)) return true;

  if (modelKey.endsWith('E')) {
    const baseModel = modelKey.slice(0, -1);
    if (baseModel && titleKey.includes(`${baseModel}ESERIES`)) return true;
  }

  return false;
}

/**
 * A busca oficial legada retorna [] tanto para uma busca válida sem resultados quanto
 * para indisponibilidade upstream. Este probe é usado somente quando precisamos
 * distinguir as duas situações na fila de homologação. Ele nunca é prova de IPL.
 */
async function probePortalAvailability(): Promise<boolean> {
  const now = Date.now();
  if (portalProbeCache && portalProbeCache.expiresAt > now) return portalProbeCache.available;
  if (portalProbePending) return portalProbePending;

  portalProbePending = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PORTAL_PROBE_TIMEOUT_MS);
    try {
      const response = await fetch(PORTAL_GRAPHQL_URL, {
        method: 'POST',
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
          Origin: PORTAL_ORIGIN,
          Referer: `${PORTAL_ORIGIN}/br/`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
        },
        body: JSON.stringify({
          operationName: 'coverageProbe',
          query: 'query coverageProbe($site: String!) { site(name: $site) { __typename } }',
          variables: { site: PORTAL_SITE },
        }),
      });
      if (!response.ok) return false;
      const payload = await response.json() as any;
      return !payload?.errors?.length && Boolean(payload?.data?.site);
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  })();

  try {
    const available = await portalProbePending;
    portalProbeCache = { available, expiresAt: Date.now() + PORTAL_PROBE_TTL_MS };
    return available;
  } finally {
    portalProbePending = null;
  }
}

async function verifyPortalIpl(model: string): Promise<PortalVerificationOutcome> {
  try {
    const results = await HusqvarnaProductSearchService.search(model);
    if (!results.length) {
      const portalAvailable = await probePortalAvailability();
      return portalAvailable
        ? {
            state: 'NO_EXACT_MATCH',
            pnc: null,
            source: null,
            note: 'Consulta concluída, sem produto exato retornado pelo Portal.',
          }
        : {
            state: 'INCONCLUSIVE',
            pnc: null,
            source: null,
            note: 'O Portal não respondeu ao controle de disponibilidade; a ausência de resultado não foi tratada como ausência de IPL.',
          };
    }

    const products = results.filter(result => result.kind === 'PRODUCT' && result.pnc && portalResultMatchesModel(result.title, model));
    if (!products.length) {
      return {
        state: 'NO_EXACT_MATCH',
        pnc: null,
        source: null,
        note: 'O Portal respondeu, mas nenhum dos resultados retornados corresponde exatamente ao modelo.',
      };
    }

    let unresolvedDetail = false;
    let resolvedDetail = false;
    let lastPnc: string | null = null;

    for (const product of products.slice(0, 4)) {
      lastPnc = product.pnc!;
      try {
        const details = await HusqvarnaOfficialDetailService.getProductDetails(product.pnc!);
        if (!details) {
          unresolvedDetail = true;
          continue;
        }
        resolvedDetail = true;
        if (details.iplSections.some(section => section.parts.length > 0)) {
          return {
            state: 'VERIFIED',
            pnc: product.pnc!,
            source: product.portalUrl || `Portal Husqvarna · ${product.title}`,
            note: 'PNC confirmado no Portal com IPL contendo peças.',
          };
        }
      } catch {
        unresolvedDetail = true;
      }
    }

    if (unresolvedDetail) {
      return {
        state: 'INCONCLUSIVE',
        pnc: lastPnc,
        source: null,
        note: 'Foi encontrado produto compatível, mas ao menos uma consulta de detalhes não pôde ser confirmada. Nenhuma ausência de IPL foi inferida.',
      };
    }

    if (resolvedDetail) {
      return {
        state: 'NO_IPL',
        pnc: lastPnc,
        source: null,
        note: 'Produto exato confirmado no Portal, porém os detalhes retornados não continham IPL com peças.',
      };
    }

    return {
      state: 'INCONCLUSIVE',
      pnc: lastPnc,
      source: null,
      note: 'A homologação não obteve detalhes suficientes para concluir a cobertura.',
    };
  } catch {
    return {
      state: 'INCONCLUSIVE',
      pnc: null,
      source: null,
      note: 'A consulta ao Portal falhou antes de produzir evidência técnica verificável.',
    };
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

export function rankPortfolioCoverageGaps(items: PortfolioCoverageItem[], limit = 12) {
  return items
    .filter(item => item.status === 'UNVERIFIED')
    .sort((a, b) => b.commercialSignals - a.commercialSignals || a.model.localeCompare(b.model))
    .slice(0, Math.max(0, limit))
    .map(item => ({
      model: item.model,
      normalizedModel: item.normalizedModel,
      status: item.status,
      commercialSignals: item.commercialSignals,
      commercialEvidence: item.commercialEvidence,
      portalVerification: item.portalVerification || 'NOT_CHECKED',
      portalVerificationNote: item.portalVerificationNote || null,
    }));
}

export async function buildPortfolioCoverage(tenantId: string, options: { verifyPortal?: boolean; concurrency?: number } = {}) {
  // Prisma implementa `distinct` em memória em alguns caminhos de findMany. Aqui o
  // universo bruto já passa de dezenas de milhares de linhas, enquanto a tela precisa
  // somente de modelos/aplicações únicas. Fazemos o DISTINCT no PostgreSQL para não
  // transportar e deduplicar esse volume no processo Node.
  const [localRows, commercialRows] = await Promise.all([
    prisma.$queryRaw<LocalCoverageRow[]>`
      SELECT DISTINCT ON (p."normalizedModel")
        p.model AS "model",
        p."normalizedModel" AS "normalizedModel",
        d.filename AS "filename"
      FROM "Part" p
      INNER JOIN "Document" d ON d.id = p."documentId"
      WHERE p.active = TRUE
        AND d."tenantId" = ${tenantId}
        AND d."archivedAt" IS NULL
        AND d.status = 'COMPLETED'
        AND d."processingStage" <> 'REMOVED'
      ORDER BY p."normalizedModel" ASC
    `,
    prisma.$queryRaw<CommercialApplicationRow[]>`
      SELECT DISTINCT mps.application AS "application"
      FROM "MasterPartSection" mps
      WHERE mps."tenantId" = ${tenantId}
        AND mps.application IS NOT NULL
      ORDER BY mps.application ASC
    `,
  ]);

  const localByModel = new Map(localRows.map(row => [row.normalizedModel, row]));
  const commercialModels = new Map<string, { model: string; signals: number; evidence: string[] }>();
  for (const row of commercialRows) {
    if (!row.application) continue;
    const application = row.application.trim();
    for (const model of extractCommercialModels(row.application)) {
      const key = normalizeIdentifier(model);
      const current = commercialModels.get(key);
      if (current) {
        current.signals += 1;
        if (application && current.evidence.length < 3 && !current.evidence.includes(application)) {
          current.evidence.push(application);
        }
      } else {
        commercialModels.set(key, { model, signals: 1, evidence: application ? [application] : [] });
      }
    }
  }

  // O universo inclui também modelos que já estão tecnicamente cadastrados, mesmo
  // que ainda não apareçam na planilha comercial atual.
  for (const row of localRows) {
    if (!commercialModels.has(row.normalizedModel)) {
      commercialModels.set(row.normalizedModel, { model: row.model, signals: 0, evidence: [] });
    }
  }

  const baseItems: PortfolioCoverageItem[] = [...commercialModels.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([normalizedModel, commercial]) => {
      const local = localByModel.get(normalizedModel);
      return local
        ? {
            model: local.model,
            normalizedModel,
            status: 'LOCAL_IPL' as const,
            source: local.filename,
            pnc: null,
            commercialSignals: commercial.signals,
            commercialEvidence: commercial.evidence,
            portalVerification: 'NOT_CHECKED' as const,
            portalVerificationNote: null,
          }
        : {
            model: commercial.model,
            normalizedModel,
            status: 'UNVERIFIED' as const,
            source: null,
            pnc: null,
            commercialSignals: commercial.signals,
            commercialEvidence: commercial.evidence,
            portalVerification: 'NOT_CHECKED' as const,
            portalVerificationNote: null,
          };
    });

  if (!options.verifyPortal) return summarizePortfolioCoverage(baseItems);

  const missing = baseItems.filter(item => item.status === 'UNVERIFIED');
  const portalChecks = await mapWithConcurrency(missing, options.concurrency || 2, async item => ({
    item,
    portal: await verifyPortalIpl(item.model),
  }));
  const portalByModel = new Map(portalChecks.map(result => [result.item.normalizedModel, result.portal]));

  const verifiedItems = baseItems.map(item => {
    const portal = portalByModel.get(item.normalizedModel);
    if (!portal) return item;
    return {
      ...item,
      status: portal.state === 'VERIFIED' ? 'PORTAL_IPL' as const : item.status,
      source: portal.state === 'VERIFIED' ? portal.source : item.source,
      pnc: portal.pnc || item.pnc,
      portalVerification: portal.state,
      portalVerificationNote: portal.note,
    };
  });
  return summarizePortfolioCoverage(verifiedItems);
}

export function summarizePortfolioCoverage(items: PortfolioCoverageItem[]) {
  const counts = { localIpl: 0, portalIpl: 0, unverified: 0, total: items.length };
  for (const item of items) {
    if (item.status === 'LOCAL_IPL') counts.localIpl += 1;
    else if (item.status === 'PORTAL_IPL') counts.portalIpl += 1;
    else counts.unverified += 1;
  }
  return {
    ...counts,
    covered: counts.localIpl + counts.portalIpl,
    coverageRate: counts.total ? (counts.localIpl + counts.portalIpl) / counts.total : 0,
    items,
  };
}
