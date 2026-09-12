import { LRUCache } from 'lru-cache';
import { normalizeIdentifier } from '../utils/normalize';

const GRAPHQL_URL = 'https://portal.husqvarnagroup.com/hbd/graphql?';
const PORTAL_ORIGIN = 'https://portal.husqvarnagroup.com';
const SITE = 'b2b-br-pt-br';
const TIMEOUT_MS = 8_000;

const REPLACEMENT_HISTORY_QUERY = `
query getSparePartReplacementHistory($siteName: String!, $sparePartId: ID!) {
  site(name: $siteName) {
    spareParts {
      byId(id: $sparePartId) {
        replacementHistory {
          articleNumber
          description
          unformattedArticleNumber
        }
      }
    }
  }
}`;

export type HusqvarnaReplacementHistoryItem = {
  partNumber: string;
  formattedPartNumber: string | null;
  description: string | null;
};

export type HusqvarnaReplacementLink = {
  from: string;
  to: string;
};

export type HusqvarnaReplacementHistoryResult = {
  queriedPartNumber: string;
  latestPartNumber: string | null;
  replacedBy: string | null;
  isLatest: boolean | null;
  completeChain: boolean;
  history: HusqvarnaReplacementHistoryItem[];
  chain: HusqvarnaReplacementLink[];
};

type GraphqlError = { message?: string };
type GraphqlEnvelope<T> = { data?: T; errors?: GraphqlError[] };

const cache = new LRUCache<string, HusqvarnaReplacementHistoryResult>({
  max: 3_000,
  ttl: 6 * 60 * 60 * 1000,
});

function validPartNumber(value: unknown): string | null {
  const normalized = normalizeIdentifier(String(value || ''));
  return /^\d{6,14}$/.test(normalized) ? normalized : null;
}

export function parseSparePartReplacementHistory(
  payload: unknown,
  partNumberInput: string,
): HusqvarnaReplacementHistoryResult | null {
  const queriedPartNumber = validPartNumber(partNumberInput);
  if (!queriedPartNumber || !payload || typeof payload !== 'object') return null;

  const root = payload as any;
  const rawHistory = root.site?.spareParts?.byId?.replacementHistory;
  if (!Array.isArray(rawHistory)) return null;

  const seen = new Set<string>();
  const history: HusqvarnaReplacementHistoryItem[] = [];
  for (const item of rawHistory) {
    const partNumber = validPartNumber(item?.unformattedArticleNumber) || validPartNumber(item?.articleNumber);
    if (!partNumber || seen.has(partNumber)) continue;
    seen.add(partNumber);
    history.push({
      partNumber,
      formattedPartNumber: item?.articleNumber ? String(item.articleNumber).trim() : null,
      description: item?.description ? String(item.description).trim() : null,
    });
  }

  if (!history.length) {
    return {
      queriedPartNumber,
      latestPartNumber: null,
      replacedBy: null,
      isLatest: null,
      completeChain: false,
      history: [],
      chain: [],
    };
  }

  // O frontend oficial Husqvarna trata replacementHistory[0] como a peça
  // mais recente da cadeia. Mantemos essa mesma semântica e nunca inferimos
  // direção a partir de replacedIds do IPL.
  const latestPartNumber = history[0].partNumber;
  const currentIndex = history.findIndex(item => item.partNumber === queriedPartNumber);

  if (currentIndex === 0) {
    return {
      queriedPartNumber,
      latestPartNumber,
      replacedBy: null,
      isLatest: true,
      completeChain: true,
      history,
      chain: [],
    };
  }

  if (currentIndex > 0) {
    const chain: HusqvarnaReplacementLink[] = [];
    for (let index = currentIndex; index > 0; index -= 1) {
      chain.push({
        from: history[index].partNumber,
        to: history[index - 1].partNumber,
      });
    }
    return {
      queriedPartNumber,
      latestPartNumber,
      replacedBy: chain[0]?.to || latestPartNumber,
      isLatest: false,
      completeChain: true,
      history,
      chain,
    };
  }

  // O próprio Portal aponta para history[0] quando a peça consultada não é a
  // primeira da lista. Se o código atual não vier no array, usamos apenas a
  // relação direta para a peça mais recente e marcamos a cadeia como parcial.
  if (latestPartNumber !== queriedPartNumber) {
    return {
      queriedPartNumber,
      latestPartNumber,
      replacedBy: latestPartNumber,
      isLatest: false,
      completeChain: false,
      history,
      chain: [{ from: queriedPartNumber, to: latestPartNumber }],
    };
  }

  return {
    queriedPartNumber,
    latestPartNumber,
    replacedBy: null,
    isLatest: true,
    completeChain: false,
    history,
    chain: [],
  };
}

async function postGraphql<T>(operationName: string, query: string, variables: Record<string, unknown>): Promise<T | null> {
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
      body: JSON.stringify({ operationName, query, variables }),
    });

    if (!response.ok) {
      console.warn(`[Husqvarna Replacement] ${operationName} retornou HTTP ${response.status}.`);
      return null;
    }

    const payload = await response.json() as GraphqlEnvelope<T>;
    if (payload.errors?.length) {
      console.warn(`[Husqvarna Replacement] ${operationName}: ${payload.errors.map(error => error.message || 'erro').join('; ')}`);
      return null;
    }
    return payload.data || null;
  } catch (error) {
    console.warn(`[Husqvarna Replacement] ${operationName} falhou: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export class HusqvarnaReplacementHistoryService {
  static async getReplacementHistory(partNumberInput: string): Promise<HusqvarnaReplacementHistoryResult | null> {
    const partNumber = validPartNumber(partNumberInput);
    if (!partNumber) return null;

    const cached = cache.get(partNumber);
    if (cached) return cached;

    const data = await postGraphql<any>('getSparePartReplacementHistory', REPLACEMENT_HISTORY_QUERY, {
      siteName: SITE,
      sparePartId: partNumber,
    });
    if (!data) return null;

    const result = parseSparePartReplacementHistory(data, partNumber);
    if (result) cache.set(partNumber, result);
    return result;
  }
}
