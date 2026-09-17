import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { HusqvarnaOfficialDetailService } from './husqvarna-official-detail.service';
import { HusqvarnaProductSearchService } from './husqvarna-product-search.service';

export type PortfolioCoverageStatus = 'LOCAL_IPL' | 'PORTAL_IPL' | 'UNVERIFIED';

export type PortfolioCoverageItem = {
  model: string;
  normalizedModel: string;
  status: PortfolioCoverageStatus;
  source: string | null;
  pnc: string | null;
  commercialSignals: number;
  commercialEvidence: string[];
};

const NOISE_TOKENS = new Set([
  'HONDA', 'HUSQVARNA', 'BRIGGS', 'STRATTON', 'KAWASAKI', 'KOHLER', 'MOTOR', 'ENGINE',
]);

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

/**
 * O Portal pode retornar famílias próximas para uma busca (ex.: 236, 236RS e 236R).
 * Cobertura técnica não pode promover um prefixo de modelo como prova do modelo pedido.
 * Por isso aceitamos somente título que termina no identificador completo. A única
 * equivalência textual deliberada é a nomenclatura histórica `445 e-series` -> `445E`
 * (e o mesmo padrão para outros modelos terminados em E).
 */
export function portalResultMatchesModel(title: string, model: string): boolean {
  const titleKey = normalizeIdentifier(title);
  const modelKey = normalizeIdentifier(model);
  if (!titleKey || !modelKey) return false;
  if (titleKey.endsWith(modelKey)) return true;

  if (modelKey.endsWith('E')) {
    const baseModel = modelKey.slice(0, -1);
    if (baseModel && titleKey.includes(`${baseModel}ESERIES`)) return true;
  }

  return false;
}

async function verifyPortalIpl(model: string): Promise<{ pnc: string; source: string } | null> {
  const results = await HusqvarnaProductSearchService.search(model);
  const products = results.filter(result => result.kind === 'PRODUCT' && result.pnc && portalResultMatchesModel(result.title, model));
  for (const product of products.slice(0, 4)) {
    try {
      const details = await HusqvarnaOfficialDetailService.getProductDetails(product.pnc!);
      if (details?.iplSections.some(section => section.parts.length > 0)) {
        return { pnc: product.pnc!, source: product.portalUrl || `Portal Husqvarna · ${product.title}` };
      }
    } catch {
      // Falha de consulta é inconclusiva e não significa ausência de IPL.
    }
  }
  return null;
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
    }));
}

export async function buildPortfolioCoverage(tenantId: string, options: { verifyPortal?: boolean; concurrency?: number } = {}) {
  const [localRows, commercialRows] = await Promise.all([
    prisma.part.findMany({
      where: { active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED', processingStage: { not: 'REMOVED' } } },
      distinct: ['normalizedModel'],
      select: { model: true, normalizedModel: true, document: { select: { filename: true } } },
      orderBy: { normalizedModel: 'asc' },
    }),
    prisma.masterPartSection.findMany({
      where: { tenantId, application: { not: null } },
      distinct: ['application'],
      select: { application: true },
      orderBy: { application: 'asc' },
    }),
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
            source: local.document.filename,
            pnc: null,
            commercialSignals: commercial.signals,
            commercialEvidence: commercial.evidence,
          }
        : {
            model: commercial.model,
            normalizedModel,
            status: 'UNVERIFIED' as const,
            source: null,
            pnc: null,
            commercialSignals: commercial.signals,
            commercialEvidence: commercial.evidence,
          };
    });

  if (!options.verifyPortal) return summarizePortfolioCoverage(baseItems);

  const missing = baseItems.filter(item => item.status === 'UNVERIFIED');
  const portalChecks = await mapWithConcurrency(missing, options.concurrency || 2, async item => ({
    item,
    portal: await verifyPortalIpl(item.model),
  }));
  const portalByModel = new Map(portalChecks.filter(result => result.portal).map(result => [result.item.normalizedModel, result.portal!]));

  const verifiedItems = baseItems.map(item => {
    const portal = portalByModel.get(item.normalizedModel);
    return portal
      ? { ...item, status: 'PORTAL_IPL' as const, source: portal.source, pnc: portal.pnc }
      : item;
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
