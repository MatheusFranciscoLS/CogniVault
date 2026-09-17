import { HusqvarnaOfficialDetailService } from './husqvarna-official-detail.service';
import { HusqvarnaProductSearchService } from './husqvarna-product-search.service';
import { portalResultMatchesModel } from './portfolio-coverage';

const GRAPHQL_URL = 'https://portal.husqvarnagroup.com/hbd/graphql?';
const PORTAL_ORIGIN = 'https://portal.husqvarnagroup.com';
export const PORTAL_BR_SITE = 'b2b-br-pt-br';
const PROBE_TIMEOUT_MS = 4_000;
const PROBE_TTL_MS = 30_000;

export type PortalProductAudit = {
  title: string;
  pnc: string;
  portalUrl: string | null;
  detailResolved: boolean;
  iplSectionCount: number | null;
  structuredPartCount: number | null;
};

export type PortalModelAudit = {
  model: string;
  searchResultCount: number;
  exactProductCount: number;
  portalAvailableWhenSearchEmpty: boolean | null;
  products: PortalProductAudit[];
};

let probeCache: { available: boolean; expiresAt: number } | null = null;
let probePending: Promise<boolean> | null = null;

async function probePortalAvailability(): Promise<boolean> {
  const now = Date.now();
  if (probeCache && probeCache.expiresAt > now) return probeCache.available;
  if (probePending) return probePending;

  probePending = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const response = await fetch(GRAPHQL_URL, {
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
          variables: { site: PORTAL_BR_SITE },
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
    const available = await probePending;
    probeCache = { available, expiresAt: Date.now() + PROBE_TTL_MS };
    return available;
  } finally {
    probePending = null;
  }
}

export async function auditPortalModel(model: string): Promise<PortalModelAudit> {
  const results = await HusqvarnaProductSearchService.search(model);
  const exactProducts = results
    .filter(result => result.kind === 'PRODUCT' && result.pnc && portalResultMatchesModel(result.title, model))
    .slice(0, 4);

  const products: PortalProductAudit[] = [];
  for (const product of exactProducts) {
    try {
      const details = await HusqvarnaOfficialDetailService.getProductDetails(product.pnc!);
      products.push({
        title: product.title,
        pnc: product.pnc!,
        portalUrl: product.portalUrl,
        detailResolved: Boolean(details),
        iplSectionCount: details ? details.iplSections.length : null,
        structuredPartCount: details
          ? details.iplSections.reduce((total, section) => total + section.parts.length, 0)
          : null,
      });
    } catch {
      products.push({
        title: product.title,
        pnc: product.pnc!,
        portalUrl: product.portalUrl,
        detailResolved: false,
        iplSectionCount: null,
        structuredPartCount: null,
      });
    }
  }

  return {
    model,
    searchResultCount: results.length,
    exactProductCount: exactProducts.length,
    portalAvailableWhenSearchEmpty: results.length === 0 ? await probePortalAvailability() : null,
    products,
  };
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

export async function auditPortalModels(models: string[], concurrency = 2): Promise<PortalModelAudit[]> {
  const safeConcurrency = Number.isFinite(concurrency)
    ? Math.max(1, Math.min(4, Math.trunc(concurrency)))
    : 2;
  return mapWithConcurrency(models, safeConcurrency, auditPortalModel);
}
