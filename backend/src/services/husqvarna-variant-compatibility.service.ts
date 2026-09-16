import { normalizeIdentifier } from '../utils/normalize';
import { HusqvarnaOfficialDetailService, type HusqvarnaOfficialProductDetails } from './husqvarna-official-detail.service';
import { buildOfficialSourceCacheKey, OfficialSourceCacheService, type OfficialSourceCacheState } from './official-source-cache.service';

const GRAPHQL_URL = 'https://portal.husqvarnagroup.com/hbd/graphql?';
const PORTAL_ORIGIN = 'https://portal.husqvarnagroup.com';
const SITE = 'b2b-br-pt-br';
const TIMEOUT_MS = 8_000;
const MAX_VARIANTS_TO_VERIFY = 30;

const SEARCH_PRODUCTS_QUERY = `
query searchForProducts($site: String!, $searchTerm: String!, $brands: [String!], $statuses: [String!], $skip: Int!, $take: Int!) {
  site(name: $site) {
    search {
      content(
        searchTerm: $searchTerm
        showResultsFor: MACHINES
        brands: $brands
        statuses: $statuses
        skip: $skip
        take: $take
      ) {
        results {
          resultItem {
            __typename
            ... on Machine {
              id sku selectedArticle
              name { productName }
              primaryArticle { id commercialReference name }
            }
            ... on DiamondTool {
              id sku selectedArticle
              name { productName }
              primaryArticle { id commercialReference name }
            }
          }
        }
      }
    }
  }
}`;

type ProductHit = {
  id?: string | null;
  sku?: string | null;
  selectedArticle?: string | null;
  name?: { productName?: string | null } | null;
  primaryArticle?: { id?: string | null; commercialReference?: string | null; name?: string | null } | null;
};

type SearchEnvelope = {
  data?: { site?: { search?: { content?: { results?: unknown } | null } | null } | null } | null;
  errors?: Array<{ message?: string }>;
};

export type OfficialVariantCompatibilityStatus = 'ALL_VARIANTS' | 'VARIES' | 'INCONCLUSIVE';

export type OfficialVariantCompatibilityDecision = {
  status: OfficialVariantCompatibilityStatus;
  model: string;
  partNumber: string;
  variantPncs: string[];
  checkedPncs: string[];
  variantCodes: Record<string, string[]>;
  reason: string;
  cacheState?: OfficialSourceCacheState;
};

export type OfficialVariantCompatibilityInput = {
  model: string;
  partNumber: string;
  section?: string | null;
  position?: string | null;
  seedPncs?: string[];
};

function normalizedModel(value: string): string {
  return normalizeIdentifier(value).replace(/^HUSQVARNA/, '');
}

function normalizedSection(value: string | null | undefined, model?: string): string {
  let normalized = normalizeIdentifier(value || '');
  const machine = normalizedModel(model || '');
  if (machine && normalized.startsWith(machine)) normalized = normalized.slice(machine.length);
  return normalized.replace(/^(IPL|PARTS|PECAS)/, '');
}

function exactModelName(value: unknown, expectedModel: string): boolean {
  const candidate = normalizedModel(String(value || ''));
  const expected = normalizedModel(expectedModel);
  return Boolean(candidate && expected && candidate === expected);
}

function validPnc(value: unknown): string {
  const normalized = normalizeIdentifier(String(value || ''));
  return /^\d{8,14}$/.test(normalized) ? normalized : '';
}

function flattenHits(value: unknown): ProductHit[] {
  if (!value) return [];
  const containers = Array.isArray(value) ? value : [value];
  const hits: ProductHit[] = [];
  for (const container of containers) {
    if (!container || typeof container !== 'object') continue;
    const raw = (container as { resultItem?: unknown }).resultItem;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const item of items) if (item && typeof item === 'object') hits.push(item as ProductHit);
  }
  return hits;
}

function pncFromHit(hit: ProductHit): string {
  return [hit.selectedArticle, hit.primaryArticle?.id, hit.primaryArticle?.commercialReference, hit.sku]
    .map(validPnc)
    .find(Boolean) || '';
}

async function rawModelSearch(model: string): Promise<string[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
        operationName: 'searchForProducts',
        query: SEARCH_PRODUCTS_QUERY,
        variables: { site: SITE, searchTerm: model, brands: null, statuses: null, skip: 0, take: 20 },
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as SearchEnvelope;
    if (payload.errors?.length) return null;
    const results = payload.data?.site?.search?.content?.results;
    const pncs = new Set<string>();
    for (const hit of flattenHits(results)) {
      const productName = hit.name?.productName || hit.primaryArticle?.name || '';
      if (!exactModelName(productName, model)) continue;
      const pnc = pncFromHit(hit);
      if (pnc) pncs.add(pnc);
    }
    return [...pncs].sort();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function discoverOfficialModelPncs(modelInput: string): Promise<string[]> {
  const model = normalizedModel(modelInput);
  if (!model) return [];
  const key = buildOfficialSourceCacheKey('HUSQVARNA', 'MODEL_VARIANTS', { model });
  const cached = await OfficialSourceCacheService.get<string[]>(
    key,
    { source: 'HUSQVARNA', resourceType: 'MODEL_VARIANTS', resourceId: model, freshMs: 6 * 60 * 60 * 1000 },
    () => rawModelSearch(modelInput),
  );
  return cached.value || [];
}

function sectionMatches(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length < 4 || right.length < 4) return false;
  return left.includes(right) || right.includes(left);
}

function codesAtPosition(details: HusqvarnaOfficialProductDetails, sectionName: string, position: string): string[] {
  const wantedSection = normalizedSection(sectionName, details.productName);
  const wantedPosition = normalizeIdentifier(position);
  const codes = new Set<string>();
  for (const section of details.iplSections) {
    const currentSection = normalizedSection(section.name, details.productName);
    if (!sectionMatches(currentSection, wantedSection)) continue;
    for (const part of section.parts) {
      if (normalizeIdentifier(part.position || '') !== wantedPosition) continue;
      const code = normalizeIdentifier(part.partNumber || '');
      if (code) codes.add(code);
    }
  }
  return [...codes].sort();
}

function referenceSection(details: HusqvarnaOfficialProductDetails, input: OfficialVariantCompatibilityInput): string | null {
  const expectedCode = normalizeIdentifier(input.partNumber);
  const expectedPosition = normalizeIdentifier(input.position || '');
  const localSection = normalizedSection(input.section, input.model);
  if (!expectedCode || !expectedPosition) return null;

  const strict: string[] = [];
  const fallback: string[] = [];
  for (const section of details.iplSections) {
    const sectionKey = normalizedSection(section.name, details.productName);
    const hasOccurrence = section.parts.some(part => (
      normalizeIdentifier(part.position || '') === expectedPosition
      && normalizeIdentifier(part.partNumber || '') === expectedCode
    ));
    if (!hasOccurrence) continue;
    fallback.push(section.name);
    if (localSection && sectionMatches(sectionKey, localSection)) strict.push(section.name);
  }
  if (strict.length === 1) return strict[0];
  if (fallback.length === 1) return fallback[0];
  return null;
}

async function loadVariantDetails(pncs: string[]): Promise<Map<string, HusqvarnaOfficialProductDetails> | null> {
  const output = new Map<string, HusqvarnaOfficialProductDetails>();
  for (let index = 0; index < pncs.length; index += 4) {
    const batch = pncs.slice(index, index + 4);
    const settled = await Promise.all(batch.map(async pnc => ({ pnc, details: await HusqvarnaOfficialDetailService.getProductDetails(pnc) })));
    for (const item of settled) {
      if (!item.details) return null;
      output.set(item.pnc, item.details);
    }
  }
  return output;
}

export function evaluateLoadedVariantDetails(
  input: OfficialVariantCompatibilityInput,
  detailsByPnc: Map<string, HusqvarnaOfficialProductDetails>,
): OfficialVariantCompatibilityDecision {
  const partNumber = normalizeIdentifier(input.partNumber);
  const variantPncs = [...detailsByPnc.keys()].sort();
  const base: Omit<OfficialVariantCompatibilityDecision, 'status' | 'reason'> = {
    model: input.model,
    partNumber,
    variantPncs,
    checkedPncs: variantPncs,
    variantCodes: {},
  };
  if (!partNumber || !input.position || !variantPncs.length) {
    return { ...base, status: 'INCONCLUSIVE', reason: 'Faltam posição ou variantes oficiais suficientes para comparar a aplicação.' };
  }

  const reference = [...detailsByPnc.values()]
    .map(details => ({ details, section: referenceSection(details, input) }))
    .find(item => Boolean(item.section));
  if (!reference?.section) {
    return { ...base, status: 'INCONCLUSIVE', reason: 'O Portal não permitiu identificar com segurança a mesma vista/posição da peça.' };
  }

  let missing = false;
  let varies = false;
  for (const pnc of variantPncs) {
    const details = detailsByPnc.get(pnc)!;
    const codes = codesAtPosition(details, reference.section, input.position);
    base.variantCodes[pnc] = codes;
    if (!codes.length) {
      missing = true;
      continue;
    }
    if (codes.length !== 1 || codes[0] !== partNumber) varies = true;
  }

  if (varies) {
    return {
      ...base,
      status: 'VARIES',
      reason: 'A mesma vista/posição possui código diferente em pelo menos uma variante oficial. PNC/S/N deve ser confirmado.',
    };
  }
  if (missing) {
    return {
      ...base,
      status: 'INCONCLUSIVE',
      reason: 'Nem todas as variantes oficiais puderam ser comparadas na mesma vista/posição.',
    };
  }
  return {
    ...base,
    status: 'ALL_VARIANTS',
    reason: variantPncs.length === 1
      ? 'O Portal retornou uma única variante oficial consultável e o código coincide na vista/posição.'
      : `O mesmo código foi confirmado na mesma vista/posição das ${variantPncs.length} variantes oficiais consultadas.`,
  };
}

async function computeCompatibility(input: OfficialVariantCompatibilityInput): Promise<OfficialVariantCompatibilityDecision | null> {
  if (!input.position || !normalizeIdentifier(input.partNumber) || !normalizedModel(input.model)) {
    return {
      status: 'INCONCLUSIVE', model: input.model, partNumber: normalizeIdentifier(input.partNumber),
      variantPncs: [], checkedPncs: [], variantCodes: {},
      reason: 'Sem posição de catálogo não é seguro declarar compatibilidade entre variantes.',
    };
  }

  const discovered = await discoverOfficialModelPncs(input.model);
  const seeds = (input.seedPncs || []).map(validPnc).filter(Boolean);
  const initialPncs = [...new Set([...seeds, ...discovered])];
  if (!initialPncs.length) return null;

  let variantPncs = initialPncs;
  for (const pnc of initialPncs.slice(0, 3)) {
    const details = await HusqvarnaOfficialDetailService.getProductDetails(pnc);
    if (!details) continue;
    const exactModel = exactModelName(details.productName, input.model);
    if (!exactModel) continue;
    variantPncs = [...new Set([
      ...initialPncs,
      details.pnc,
      ...details.variants.map(variant => validPnc(variant.pnc)).filter(Boolean),
    ])].sort();
    break;
  }

  if (!variantPncs.length || variantPncs.length > MAX_VARIANTS_TO_VERIFY) {
    return {
      status: 'INCONCLUSIVE', model: input.model, partNumber: normalizeIdentifier(input.partNumber),
      variantPncs, checkedPncs: [], variantCodes: {},
      reason: variantPncs.length > MAX_VARIANTS_TO_VERIFY
        ? `O produto possui mais de ${MAX_VARIANTS_TO_VERIFY} variantes; a checagem automática foi bloqueada para não sobrecarregar o Portal.`
        : 'Nenhuma variante oficial foi encontrada.',
    };
  }

  const details = await loadVariantDetails(variantPncs);
  if (!details) return null;
  return evaluateLoadedVariantDetails(input, details);
}

export class HusqvarnaVariantCompatibilityService {
  static async evaluate(input: OfficialVariantCompatibilityInput): Promise<OfficialVariantCompatibilityDecision> {
    const identity = {
      model: normalizedModel(input.model),
      partNumber: normalizeIdentifier(input.partNumber),
      section: normalizedSection(input.section, input.model),
      position: normalizeIdentifier(input.position || ''),
      seedPncs: (input.seedPncs || []).map(validPnc).filter(Boolean).sort(),
    };
    const key = buildOfficialSourceCacheKey('HUSQVARNA', 'VARIANT_COMPATIBILITY', identity);
    const result = await OfficialSourceCacheService.get<OfficialVariantCompatibilityDecision>(
      key,
      { source: 'HUSQVARNA', resourceType: 'VARIANT_COMPATIBILITY', resourceId: `${identity.model}:${identity.partNumber}`, freshMs: 6 * 60 * 60 * 1000 },
      () => computeCompatibility(input),
    );
    if (result.value) return { ...result.value, cacheState: result.state };
    return {
      status: 'INCONCLUSIVE',
      model: input.model,
      partNumber: normalizeIdentifier(input.partNumber),
      variantPncs: [],
      checkedPncs: [],
      variantCodes: {},
      reason: 'A fonte oficial está indisponível ou não trouxe evidência suficiente; isso não prova incompatibilidade.',
      cacheState: result.state,
    };
  }
}
