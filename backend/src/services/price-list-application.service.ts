import { Prisma, type PrismaClient } from '@prisma/client';
import { normalizeIdentifier } from '../utils/normalize';
import type { HtmlPriceItem } from '../scripts/price-list-html';

/**
 * "Serve em" dos acessórios, ferramentas e lubrificantes (2026-10-09, dono: "aplicação seria bom"). A lista traz, em cada acessório, as máquinas em que ele
 * serve ("PA1100 - 129LK / 525LK / 327LDX · 536LiP4 / 530iPT5"). O leitor passou a guardar esse texto como a aplicação da peça; **código novo já entra com
 * ele**, e aqui está o que faltava: **preencher o código que a loja já tem** (os 254 acessórios que entraram na primeira importação ficaram sem aplicação).
 *
 * Só PREENCHE: nunca troca uma aplicação que já existe nem apaga nada, e não toca em preço. É conferido como o resto da atualização (o relatório mostra
 * quantos serão preenchidos, a gravação só vale com esse número aprovado, e depois relê o banco).
 */

export type ApplicationFillRow = { normalizedNumber: string; application: string; key: string };

/** As linhas da lista que servem para preencher: acessórios, ferramentas e lubrificantes (peça de reposição já traz o modelo). */
export function applicationFillRows(items: HtmlPriceItem[]): ApplicationFillRow[] {
  const rows: ApplicationFillRow[] = [];
  for (const item of items) {
    if (item.section === 'pecas') continue;
    const application = item.applications.find(entry => entry.application)?.application;
    if (!application) continue;
    const key = normalizeIdentifier(application);
    if (key) rows.push({ normalizedNumber: item.normalizedNumber, application, key });
  }
  return rows;
}

type Db = PrismaClient | Prisma.TransactionClient;

// Casa a linha do banco SEM aplicação com o texto da lista. A chave única do banco é (código, categoria, aplicação): se já existe uma linha da mesma
// categoria com essa aplicação, preencher criaria duplicata, então essa fica de fora (e fora da conta).
const fillSql = (tenantId: string, rows: ApplicationFillRow[]) => Prisma.sql`
  FROM "MasterPartSection" AS s
  JOIN (VALUES ${Prisma.join(rows.map(row => Prisma.sql`(${row.normalizedNumber}::text, ${row.application}::text, ${row.key}::text)`))}) AS v("code", "app", "key")
    ON v."code" = s."normalizedNumber"
  WHERE s."tenantId" = ${tenantId}
    AND s."application" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "MasterPartSection" AS other
      WHERE other."tenantId" = s."tenantId" AND other."normalizedNumber" = s."normalizedNumber"
        AND other."section" = s."section" AND other."applicationKey" = v."key"
    )`;

const BATCH = 400;
const batches = <T>(items: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH) out.push(items.slice(i, i + BATCH));
  return out;
};

/** Quantos CÓDIGOS da loja serão preenchidos. Só lê. */
export async function countApplicationFill(db: Db, tenantId: string, rows: ApplicationFillRow[]): Promise<number> {
  const codes = new Set<string>();
  for (const batch of batches(rows)) {
    const found = await db.$queryRaw<Array<{ code: string }>>(Prisma.sql`SELECT DISTINCT s."normalizedNumber" AS code ${fillSql(tenantId, batch)}`);
    for (const row of found) codes.add(row.code);
  }
  return codes.size;
}

/** Preenche (dentro da transação da atualização). Devolve quantas linhas de seção foram preenchidas. */
export async function applyApplicationFill(tx: Prisma.TransactionClient, tenantId: string, rows: ApplicationFillRow[], now: Date): Promise<number> {
  let filled = 0;
  for (const batch of batches(rows)) {
    filled += await tx.$executeRaw(Prisma.sql`
      UPDATE "MasterPartSection" AS s
      SET "application" = v."app", "applicationKey" = v."key", "updatedAt" = ${now}
      FROM (VALUES ${Prisma.join(batch.map(row => Prisma.sql`(${row.normalizedNumber}::text, ${row.application}::text, ${row.key}::text)`))}) AS v("code", "app", "key")
      WHERE s."tenantId" = ${tenantId}
        AND s."normalizedNumber" = v."code"
        AND s."application" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "MasterPartSection" AS other
          WHERE other."tenantId" = s."tenantId" AND other."normalizedNumber" = s."normalizedNumber"
            AND other."section" = s."section" AND other."applicationKey" = v."key"
        )`);
  }
  return filled;
}
