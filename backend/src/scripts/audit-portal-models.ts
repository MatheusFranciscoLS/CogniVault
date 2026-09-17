import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { normalizeIdentifier } from '../utils/normalize';
import { HusqvarnaOfficialDetailService } from '../services/husqvarna-official-detail.service';
import { HusqvarnaProductSearchService } from '../services/husqvarna-product-search.service';
import { portalResultMatchesModel } from '../services/portfolio-coverage';

const GRAPHQL_URL = 'https://portal.husqvarnagroup.com/hbd/graphql?';
const PORTAL_ORIGIN = 'https://portal.husqvarnagroup.com';
const SITE = 'b2b-br-pt-br';
const PROBE_TIMEOUT_MS = 4_000;

type ProductAudit = {
  title: string;
  pnc: string;
  portalUrl: string | null;
  detailResolved: boolean;
  iplSectionCount: number | null;
  structuredPartCount: number | null;
};

type ModelAudit = {
  model: string;
  searchResultCount: number;
  exactProductCount: number;
  portalAvailableWhenSearchEmpty: boolean | null;
  products: ProductAudit[];
};

function argValue(name: string): string {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length).trim() || '';
}

function parseModels(raw: string): string[] {
  const unique = new Map<string, string>();
  for (const value of raw.split(/[,;\n]+/)) {
    const model = value.trim();
    const normalized = normalizeIdentifier(model);
    if (!normalized || normalized.length > 40 || unique.has(normalized)) continue;
    unique.set(normalized, model);
  }
  return [...unique.values()];
}

async function probePortalAvailability(): Promise<boolean> {
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
        variables: { site: SITE },
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
}

async function auditModel(model: string): Promise<ModelAudit> {
  const results = await HusqvarnaProductSearchService.search(model);
  const exactProducts = results
    .filter(result => result.kind === 'PRODUCT' && result.pnc && portalResultMatchesModel(result.title, model))
    .slice(0, 4);

  const products: ProductAudit[] = [];
  for (const product of exactProducts) {
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

async function main() {
  const models = parseModels(argValue('models'));
  if (!models.length) throw new Error('Informe --models=323R,P12597,...');

  const requestedConcurrency = Number(argValue('concurrency') || '2');
  const concurrency = Number.isFinite(requestedConcurrency)
    ? Math.max(1, Math.min(4, Math.trunc(requestedConcurrency)))
    : 2;

  const results = await mapWithConcurrency(models, concurrency, auditModel);
  const report = {
    generatedAt: new Date().toISOString(),
    site: SITE,
    models: results,
  };

  const output = argValue('output');
  if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error('❌ Auditoria focada do Portal não executada:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
