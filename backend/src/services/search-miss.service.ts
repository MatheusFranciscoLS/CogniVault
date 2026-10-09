import { prisma } from '../config/prisma';

/**
 * Buscas que o balcão fez e não acharam nada (pedido do dono, 2026-10-09).
 *
 * Guarda só o TEXTO digitado, agregado por texto normalizado: sem usuário, sem cliente, sem máquina. Repetir a mesma busca só soma
 * `count`. Serve para o dono ver o que falta no cadastro de preços e no catálogo, que era invisível: `SearchHistory` só guarda a busca que deu certo.
 */

const MIN_LENGTH = 2;
const MAX_LENGTH = 80;
/** Teto de textos DISTINTOS por loja: quem digita lixo não faz a tabela crescer sem limite. */
const MAX_DISTINCT_PER_TENANT = 3000;

/** Minúsculo, sem acento, espaços juntados. É a chave que une "Carburador  143RII" e "carburador 143rii". */
export function normalizeMissQuery(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** O que NÃO vale guardar: curto demais, longo demais, e o que parece dado pessoal (e-mail, link, número comprido demais para ser código de peça). */
export function recordableMissQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) return null;
  if (/[@]|https?:|www\./i.test(text)) return null;
  if (text.replace(/\D/g, '').length > 14) return null;
  return text;
}

export class SearchMissService {
  /** Soma uma ocorrência. Nunca lança: registrar a busca não pode atrapalhar o atendimento. */
  static async record(tenantId: string, raw: unknown): Promise<boolean> {
    const text = recordableMissQuery(raw);
    if (!text) return false;
    const normalizedQuery = normalizeMissQuery(text);
    if (normalizedQuery.length < MIN_LENGTH) return false;
    try {
      const existing = await prisma.searchMiss.findUnique({ where: { tenantId_normalizedQuery: { tenantId, normalizedQuery } }, select: { id: true } });
      if (!existing && (await prisma.searchMiss.count({ where: { tenantId } })) >= MAX_DISTINCT_PER_TENANT) return false;
      await prisma.searchMiss.upsert({
        where: { tenantId_normalizedQuery: { tenantId, normalizedQuery } },
        create: { tenantId, query: text, normalizedQuery },
        update: { count: { increment: 1 }, lastSeenAt: new Date() },
      });
      return true;
    } catch (error) {
      console.error('❌ Falha ao registrar busca sem resultado:', error);
      return false;
    }
  }

  /** As mais repetidas primeiro (o que mais faz falta), dentro do período. */
  static async top(tenantId: string, days: number, limit: number) {
    const since = new Date(Date.now() - Math.min(Math.max(Math.trunc(days) || 30, 1), 365) * 24 * 60 * 60 * 1000);
    const where = { tenantId, lastSeenAt: { gte: since } };
    const [items, total] = await Promise.all([
      prisma.searchMiss.findMany({
        where,
        orderBy: [{ count: 'desc' }, { lastSeenAt: 'desc' }],
        take: Math.min(Math.max(Math.trunc(limit) || 50, 1), 200),
        select: { id: true, query: true, count: true, firstSeenAt: true, lastSeenAt: true },
      }),
      prisma.searchMiss.count({ where }),
    ]);
    return { total, items };
  }

  /** O dono cadastrou a peça (ou a busca não faz sentido): tira da lista. */
  static async dismiss(tenantId: string, id: string): Promise<boolean> {
    const result = await prisma.searchMiss.deleteMany({ where: { id, tenantId } });
    return result.count > 0;
  }
}
