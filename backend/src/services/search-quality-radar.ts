import { normalizeIdentifier } from '../utils/normalize';
import { buildFallbackIntent } from './chat-reliability';

export type SearchRadarStatus = 'PNC_REQUIRED' | 'MODEL_REQUIRED' | 'PART_REQUIRED' | 'AMBIGUOUS' | 'NOT_FOUND';

export type SearchHistoryRadarRow = {
  query: string;
  pnc: string | null;
  status: string;
  createdAt: Date | string;
};

export type SearchRadarItem = {
  query: string;
  pnc: string | null;
  model: string | null;
  partDescription: string | null;
  status: SearchRadarStatus;
  count: number;
  lastSeen: string;
};

const UNRESOLVED = new Set<SearchRadarStatus>([
  'PNC_REQUIRED',
  'MODEL_REQUIRED',
  'PART_REQUIRED',
  'AMBIGUOUS',
  'NOT_FOUND',
]);

function dateValue(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function identity(row: SearchHistoryRadarRow): string {
  const intent = buildFallbackIntent(row.query);
  const part = normalizeIdentifier(intent.partDescription || row.query);
  const model = normalizeIdentifier(intent.model);
  const pnc = normalizeIdentifier(row.pnc || intent.pnc);
  return `${part}|${model}|${pnc}`;
}

/**
 * Converte o histórico real do balcão em uma pequena fila de consultas que ainda
 * terminam sem código seguro. Uma consulta que posteriormente termina em FOUND é
 * considerada resolvida e sai do radar. Nenhuma busca é reexecutada aqui: o
 * painel é diagnóstico e não consome Gemini/embeddings.
 */
export function buildSearchQualityRadar(rows: SearchHistoryRadarRow[], limit = 10): SearchRadarItem[] {
  const groups = new Map<string, {
    latest: SearchHistoryRadarRow;
    latestAt: Date;
    unresolvedCount: number;
  }>();

  for (const row of rows) {
    const key = identity(row);
    if (!key.replaceAll('|', '')) continue;
    const at = dateValue(row.createdAt);
    const current = groups.get(key);
    const unresolved = UNRESOLVED.has(row.status as SearchRadarStatus);

    if (!current) {
      groups.set(key, {
        latest: row,
        latestAt: at,
        unresolvedCount: unresolved ? 1 : 0,
      });
      continue;
    }

    if (unresolved) current.unresolvedCount += 1;
    if (at > current.latestAt) {
      current.latest = row;
      current.latestAt = at;
    }
  }

  return [...groups.values()]
    .filter(group => UNRESOLVED.has(group.latest.status as SearchRadarStatus) && group.unresolvedCount > 0)
    .map(group => {
      const intent = buildFallbackIntent(group.latest.query);
      return {
        query: group.latest.query,
        pnc: group.latest.pnc || intent.pnc || null,
        model: intent.model || null,
        partDescription: intent.partDescription || null,
        status: group.latest.status as SearchRadarStatus,
        count: group.unresolvedCount,
        lastSeen: group.latestAt.toISOString(),
      };
    })
    .sort((a, b) => b.count - a.count || Date.parse(b.lastSeen) - Date.parse(a.lastSeen))
    .slice(0, Math.max(1, Math.min(25, Math.trunc(limit))));
}
