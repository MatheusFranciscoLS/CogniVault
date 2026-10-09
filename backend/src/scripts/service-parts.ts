import { normalizeIdentifier } from '../utils/normalize';

/**
 * Peças de REVISÃO de cada máquina, lidas do campo `reparo` da lista de preços da Husqvarna (pedido do dono, 2026-10-09).
 *
 * A lista diz, para cada código e PNC, o tipo de uso: PREVENTIVO (troca antes de quebrar), CONSUMÍVEL (gasta com o uso: vela, filtro, corrente),
 * PREDITIVO (troca por desgaste medido) ou CORRETIVO (conserto depois que quebrou). Revisão é o que se troca ANTES de quebrar, então o CORRETIVO fica de
 * fora de propósito (são ~19 mil linhas que não são revisão). Função pura: devolve o que leu, sem tocar em banco.
 */

export type ServicePartKind = 'PREVENTIVO' | 'CONSUMIVEL' | 'PREDITIVO';

export type ServicePartLink = {
  /** PNC da máquina, 9 dígitos (o Portal e o painel da máquina usam os 9 primeiros). */
  pnc: string;
  partNumber: string;
  normalizedNumber: string;
  name: string;
  kind: ServicePartKind;
};

/** Se o mesmo código aparece com dois tipos para a mesma máquina, vale o mais forte para quem vai montar a revisão. */
const KIND_RANK: Record<ServicePartKind, number> = { PREVENTIVO: 0, PREDITIVO: 1, CONSUMIVEL: 2 };

function kindOf(raw: unknown): ServicePartKind | null {
  if (typeof raw !== 'string') return null;
  const value = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  if (value === 'PREVENTIVO' || value === 'CONSUMIVEL' || value === 'PREDITIVO') return value;
  return null;
}

function pncOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 11 ? digits.slice(0, 9) : null;
}

function cleanText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  return text && text !== '-' ? text : null;
}

export type ServicePartsParse = {
  links: ServicePartLink[];
  stats: { rows: number; kept: number; skippedKind: number; badPnc: number; badCode: number };
};

/** Lê as linhas `{ codigo, pnc, reparo, descricao }` (já filtradas ou não). Linha de outro tipo (corretivo, vazio) é ignorada sem alarde. */
export function parseServicePartRows(rows: unknown): ServicePartsParse {
  const stats = { rows: 0, kept: 0, skippedKind: 0, badPnc: 0, badCode: 0 };
  const byKey = new Map<string, ServicePartLink>();
  if (!Array.isArray(rows)) return { links: [], stats };

  for (const raw of rows as Array<Record<string, unknown> | null>) {
    stats.rows += 1;
    const kind = kindOf(raw?.reparo);
    if (!kind) {
      stats.skippedKind += 1;
      continue;
    }
    const pnc = pncOf(raw?.pnc);
    if (!pnc) {
      stats.badPnc += 1;
      continue;
    }
    const partNumber = cleanText(raw?.codigo);
    const normalizedNumber = normalizeIdentifier(partNumber);
    if (!partNumber || !normalizedNumber) {
      stats.badCode += 1;
      continue;
    }
    const key = `${pnc}|${normalizedNumber}`;
    const known = byKey.get(key);
    if (known && KIND_RANK[known.kind] <= KIND_RANK[kind]) continue;
    byKey.set(key, { pnc, partNumber, normalizedNumber, name: cleanText(raw?.descricao) ?? partNumber, kind });
  }

  const links = [...byKey.values()].sort((a, b) => a.pnc.localeCompare(b.pnc) || a.normalizedNumber.localeCompare(b.normalizedNumber));
  stats.kept = links.length;
  return { links, stats };
}

export type ServicePartsDiff = {
  stored: number;
  incoming: number;
  /** Ligações que a lista traz e o banco ainda não tem (ou mudaram de tipo). */
  added: number;
  /** Ligações que o banco tem e a lista nova não traz mais: saem, porque a tabela é espelho da lista. */
  removed: number;
  machines: number;
};

type StoredLink = { pnc: string; normalizedNumber: string; kind: string };

/** Compara o que está gravado com o que a lista traz. Lista sem nenhuma ligação NÃO apaga nada (lista antiga, sem o campo): é "sem informação". */
export function diffServiceParts(stored: StoredLink[], incoming: ServicePartLink[]): ServicePartsDiff {
  const machines = new Set(incoming.map(link => link.pnc)).size;
  if (incoming.length === 0) return { stored: stored.length, incoming: 0, added: 0, removed: 0, machines: 0 };
  const key = (link: StoredLink) => `${link.pnc}|${link.normalizedNumber}|${link.kind}`;
  const storedKeys = new Set(stored.map(key));
  const incomingKeys = new Set(incoming.map(key));
  let added = 0;
  for (const value of incomingKeys) if (!storedKeys.has(value)) added += 1;
  let removed = 0;
  for (const value of storedKeys) if (!incomingKeys.has(value)) removed += 1;
  return { stored: stored.length, incoming: incoming.length, added, removed, machines };
}
