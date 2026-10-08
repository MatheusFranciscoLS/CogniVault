import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { capRegexInput } from '../utils/regex-input';
import { HusqvarnaOfficialDetailService } from './husqvarna-official-detail.service';
import { HusqvarnaProductSearchService } from './husqvarna-product-search.service';

export type PortfolioCoverageStatus = 'LOCAL_IPL' | 'PORTAL_IPL' | 'PORTAL_DOCUMENT' | 'NOT_APPLICABLE' | 'PAUSED' | 'UNVERIFIED';
export type PortalVerificationState = 'NOT_CHECKED' | 'VERIFIED' | 'DOCUMENT_ONLY' | 'NO_EXACT_MATCH' | 'NO_IPL' | 'INCONCLUSIVE';

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
  /** Categoria da lista comercial (ex.: AUTOMOWER, TRATOR), para o dono ler a lacuna sem decifrar o modelo. */
  commercialCategory?: string | null;
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
  category: string | null;
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
 * Modelo que o Portal já conferiu e NÃO tem lista de peças, e que também não está na lista
 * vigente de máquinas da Husqvarna, é modelo fora de linha, acessório ou marca secundária:
 * não há vista explodida a esperar, então não conta como lacuna (nem entra na base da
 * cobertura). Modelo que está na lista vigente continua lacuna de verdade.
 * Sem lista de máquinas importada não se conclui nada: nada é marcado.
 */
export function markNotInLine(items: PortfolioCoverageItem[], listedModels: string[]): PortfolioCoverageItem[] {
  const listed = listedModels.map(model => normalizeIdentifier(model)).filter(Boolean);
  if (!listed.length) return items;
  const inLine = (key: string) => listed.some(entry => {
    if (entry === key) return true;
    // "AM315" na lista comercial e "AM315 Mark II" na lista de máquinas: mesma máquina, até 6 letras a mais.
    if (entry.startsWith(key)) return /^[A-Z]{1,6}$/.test(entry.slice(key.length));
    if (key.startsWith(entry)) return /^[A-Z]{1,3}$/.test(key.slice(entry.length));
    return false;
  });
  return items.map(item => {
    if (item.status !== 'UNVERIFIED') return item;
    if (item.portalVerification !== 'NO_EXACT_MATCH' && item.portalVerification !== 'NO_IPL') return item;
    return inLine(normalizeIdentifier(item.model)) ? item : { ...item, status: 'NOT_APPLICABLE' as const };
  });
}

/** PNC (artigo de 9 dígitos, sem o BR) das máquinas da lista vigente que correspondem a este modelo; é o caminho exato, sem depender do nome. */
export function listedPncsForModel(listed: ReadonlyArray<{ model: string; pnc: string }>, model: string): string[] {
  const key = normalizeIdentifier(model);
  if (!key) return [];
  const found = listed
    .filter(entry => {
      const entryKey = normalizeIdentifier(entry.model);
      if (entryKey === key) return true;
      if (entryKey.startsWith(key)) return /^[A-Z]{1,6}$/.test(entryKey.slice(key.length));
      return false;
    })
    .map(entry => entry.pnc.trim().replace(/(?<=\d)BR$/i, ''))
    .filter(pnc => /^\d{9,11}$/.test(pnc));
  return [...new Set(found)].slice(0, 4);
}

/**
 * O Portal guarda a lista de peças de muita máquina antiga só como DOCUMENTO (PDF de IPL),
 * sem produto estruturado. Esse documento também é fonte oficial: o balcão abre e lê o
 * código no desenho. O título precisa citar o modelo inteiro, sem letra ou número colado
 * (`1120i` não é `120i`) e sem um código curto de outro modelo na frente (`PW 235R`).
 */
export function portalDocumentMatchesModel(title: string, model: string): boolean {
  return modelKeyVariants(capRegexInput(String(model ?? ''), 40)).some(variant => portalDocumentMatchesKey(title, variant));
}

function portalDocumentMatchesKey(title: string, model: string): boolean {
  const key = normalizeIdentifier(model);
  const text = capRegexInput(String(title ?? ''), 300);
  if (key.length < 3 || !/\bIPL\b/i.test(text)) return false;
  const pattern = [...key].join('[\\s\\-./]*');
  const match = new RegExp(`(?<![A-Z0-9])${pattern}(?![A-Z0-9])`, 'i').exec(text);
  if (!match) return false;
  const before = text.slice(0, match.index);
  const prefix = /(?:^|[^A-Z0-9])([A-Z]{1,3})[\s-]*$/i.exec(before)?.[1]?.toUpperCase();
  return !prefix || prefix === 'IPL';
}

/**
 * O Portal pode retornar famílias próximas para uma busca (ex.: 236, 236RS e 236R).
 * Cobertura técnica não pode promover um prefixo de modelo como prova do modelo pedido.
 * Também rejeitamos um código curto imediatamente anterior ao modelo solicitado
 * (ex.: `PW 235R` não comprova `235R`). A única equivalência textual deliberada é a
 * nomenclatura histórica `445 e-series` -> `445E` (e o mesmo padrão para outros
 * modelos terminados em E).
 */
/**
 * O Portal acrescenta ao nome do produto o que NÃO faz parte do modelo: o que acompanha
 * ("(sem bateria e carregador)"), a marca registrada ("540i XP®") e a capacidade do
 * pulverizador ("301SM 1.5L"). Sem tirar isso, `LC137i` nunca casava com
 * "Cortador de Grama Husqvarna a bateria LC137i (sem bateria e carregador)".
 */
export function stripPortalTitleNoise(title: string): string {
  return capRegexInput(String(title ?? ''), 300)
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/\([^)]{0,80}\)/g, ' ')
    .replace(/[®™]/g, '')
    .replace(/\s+\d{1,3}(?:[.,]\d)?\s?L\s*$/i, '')
    .trim();
}

/**
 * A lista comercial escreve `750K` e o Portal `K750` (mesma serra). Só vale para número + UMA letra:
 * qualquer outra reordenação seria chute.
 */
export function modelKeyVariants(model: string): string[] {
  const key = normalizeIdentifier(model);
  const swapped = /^(\d{2,4})([A-Z])$/.exec(key);
  return swapped ? [key, `${swapped[2]}${swapped[1]}`] : [key];
}

export function portalResultMatchesModel(rawTitle: string, model: string): boolean {
  const variants = modelKeyVariants(model);
  if (variants.length > 1) return variants.some(variant => portalResultMatchesKey(rawTitle, variant));
  return portalResultMatchesKey(rawTitle, variants[0] ?? '');
}

function portalResultMatchesKey(rawTitle: string, model: string): boolean {
  const title = stripPortalTitleNoise(rawTitle);
  const titleKey = normalizeIdentifier(title);
  const modelKey = normalizeIdentifier(model);
  if (!titleKey || !modelKey) return false;
  if (titleKey.endsWith(modelKey) && !hasDistinctShortCodePrefix(title, modelKey)) return true;

  // O modelo como palavra inteira em qualquer ponto do título, com o que vier depois: "HH 212 - 599348659", "HH 196/MP/OB",
  // "Motobomba ... W25P 2T Autoescorvante". Sem número ou letra colado ("543RS" não é "543R") e sem código curto de outro
  // modelo na frente ("PW 235R"), as mesmas guardas do documento.
  if (modelKey.length >= 3 && modelKey.length <= 24) {
    const text = capRegexInput(title, 300).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const pattern = [...modelKey].join('[\\s\\-./]*');
    const match = new RegExp(`(?<![A-Z0-9])${pattern}(?![A-Z0-9])`).exec(text);
    if (match) {
      const prefix = /(?:^|[^A-Z0-9])([A-Z]{1,3})[\s-]*$/.exec(text.slice(0, match.index))?.[1];
      // O que vem depois só pode ser pontuação ("HH 196/MP/OB", "HH 212 - 599348659"), número de artigo ou "2T"/"4T": uma palavra
      // ("II", "Mark", "XP") faz outra máquina ("143R II" não é "143R").
      const rest = text.slice(match.index + match[0].length);
      if (!prefix && (/^\s*($|[-–,/(])/.test(rest) || /^\s+\d{5,}\b/.test(rest) || /^\s+[24]T\b/.test(rest))) return true;
    }
  }

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

/**
 * Categorias DESLIGADAS da cobertura por decisão do dono (2026-10-08: "os Automower deixe em off por enquanto"). O robô não tem vista
 * explodida no Portal BR nem no site público, então contava como lacuna que ninguém resolve. Em pausa: não entra na conta, não gasta
 * consulta ao Portal e continua listado, para não parecer que sumiu. Para religar, tire a categoria desta lista.
 */
export const PAUSED_COVERAGE_CATEGORIES: ReadonlyArray<RegExp> = [/automower/i];

/**
 * Modelos desligados um a um, com o motivo. 226KS12 (2026-10-08): derriçadeira de café = motor 226K + acessório de mão KS12. O dono informou
 * que a Husqvarna NÃO vende mais o 226KS12 (fica só a roçadeira 226K) e que o acessório saiu da lista de preços; a lista importada de
 * 05/10/2026 ainda os traz (R$ 3.499,00 e R$ 1.150,00), então ela é anterior à saída. Enquanto a lista nova não for importada, o modelo fica
 * em pausa; depois da importação (espelho) ele sai de "em linha" sozinho e esta entrada pode ser apagada. Nunca teve vista do conjunto:
 * o Portal só tem manual e o site público só tem vista dos componentes, cada um no seu artigo.
 */
export const PAUSED_COVERAGE_MODELS: ReadonlyArray<string> = ['226KS12'];

export function isPausedModel(model: string): boolean {
  const key = normalizeIdentifier(model);
  return PAUSED_COVERAGE_MODELS.some(paused => normalizeIdentifier(paused) === key);
}

export function isPausedCategory(category: string | null | undefined): boolean {
  return Boolean(category) && PAUSED_COVERAGE_CATEGORIES.some(pattern => pattern.test(category as string));
}

/** Marca como PAUSED o que ainda não tem fonte e pertence a uma categoria desligada. O que já tem vista continua contando. */
export function markPaused(items: PortfolioCoverageItem[]): PortfolioCoverageItem[] {
  return items.map(item => (item.status === 'UNVERIFIED' && (isPausedCategory(item.commercialCategory) || isPausedModel(item.model)) ? { ...item, status: 'PAUSED' as const } : item));
}

export function listPaused(items: PortfolioCoverageItem[]) {
  return items
    .filter(item => item.status === 'PAUSED')
    .sort((a, b) => a.model.localeCompare(b.model))
    .map(item => ({ model: item.model, normalizedModel: item.normalizedModel, commercialCategory: item.commercialCategory ?? null }));
}

export function listNotApplicable(items: PortfolioCoverageItem[]) {
  return items
    .filter(item => item.status === 'NOT_APPLICABLE')
    .sort((a, b) => (a.commercialCategory || '').localeCompare(b.commercialCategory || '') || a.model.localeCompare(b.model))
    .map(item => ({ model: item.model, normalizedModel: item.normalizedModel, commercialCategory: item.commercialCategory ?? null }));
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
      commercialCategory: item.commercialCategory ?? null,
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
      SELECT mps.application AS "application", MIN(mps."productCategory") AS "category"
      FROM "MasterPartSection" mps
      WHERE mps."tenantId" = ${tenantId}
        AND mps.application IS NOT NULL
      GROUP BY mps.application
      ORDER BY mps.application ASC
    `,
  ]);

  const localByModel = new Map(localRows.map(row => [row.normalizedModel, row]));
  const commercialModels = new Map<string, { model: string; signals: number; evidence: string[]; category?: string | null }>();
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
        commercialModels.set(key, { model, signals: 1, evidence: application ? [application] : [], category: row.category });
      }
    }
  }

  // O universo inclui também modelos que já estão tecnicamente cadastrados, mesmo
  // que ainda não apareçam na planilha comercial atual.
  for (const row of localRows) {
    if (!commercialModels.has(row.normalizedModel)) {
      commercialModels.set(row.normalizedModel, { model: row.model, signals: 0, evidence: [], category: null });
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
            commercialCategory: commercial.category ?? null,
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
            commercialCategory: commercial.category ?? null,
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
      status: portal.state === 'VERIFIED' ? 'PORTAL_IPL' as const : portal.state === 'DOCUMENT_ONLY' ? 'PORTAL_DOCUMENT' as const : item.status,
      source: portal.state === 'VERIFIED' || portal.state === 'DOCUMENT_ONLY' ? portal.source : item.source,
      pnc: portal.pnc || item.pnc,
      portalVerification: portal.state,
      portalVerificationNote: portal.note,
    };
  });
  return summarizePortfolioCoverage(verifiedItems);
}

export function summarizePortfolioCoverage(rawItems: PortfolioCoverageItem[]) {
  const items = markPaused(rawItems);
  const counts = { localIpl: 0, portalIpl: 0, portalDocument: 0, notApplicable: 0, paused: 0, unverified: 0, total: items.length };
  for (const item of items) {
    if (item.status === 'LOCAL_IPL') counts.localIpl += 1;
    else if (item.status === 'PORTAL_IPL') counts.portalIpl += 1;
    else if (item.status === 'PORTAL_DOCUMENT') counts.portalDocument += 1;
    else if (item.status === 'NOT_APPLICABLE') counts.notApplicable += 1;
    else if (item.status === 'PAUSED') counts.paused += 1;
    else counts.unverified += 1;
  }
  return {
    ...counts,
    covered: counts.localIpl + counts.portalIpl + counts.portalDocument,
    coverageRate: counts.total - counts.notApplicable - counts.paused > 0 ? (counts.localIpl + counts.portalIpl + counts.portalDocument) / (counts.total - counts.notApplicable - counts.paused) : 0,
    items,
  };
}
