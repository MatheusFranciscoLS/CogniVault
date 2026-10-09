import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Peças de motor que o balcão já consultou no catálogo do fabricante (Briggs, Kawasaki, Kohler) e que a loja não tem com preço.
 *
 * O balcão abre o catálogo de um motor, o sistema lê as peças e as guarda em `OfficialPartIndex`. Se uma peça lida não está na lista de preços da
 * loja (ou está com preço zero), o atendente vê "sem preço" e o cliente espera. Esta lista mostra ao dono QUAIS são, da que serve a mais motores
 * para a que serve a menos, para decidir o que cadastrar.
 *
 * `OfficialPartIndex` é dado público do fabricante e não tem tenant; o preço é da loja (`MasterPart.tenantId`). Só entra o que foi LIDO: peça de
 * motor que ninguém abriu não aparece, e isso é de propósito (é demanda, não o catálogo inteiro).
 */
export type EnginePartWithoutPrice = {
  partNumber: string;
  name: string;
  sources: string[];
  engines: number;
  /** Alguns dos motores onde a peça foi lida, para o dono reconhecer. */
  engineExamples: string[];
};

export type EnginePartsWithoutPrice = { total: number; items: EnginePartWithoutPrice[] };

type Row = { partNumber: string; name: string; sources: string[]; engines: bigint | number; engineExamples: string[] };

export class EnginePartsWithoutPriceService {
  /** `onlyNormalized` restringe a consulta a esses códigos (os testes usam, para não depender do que a loja simulada já acumulou); em produção fica vazio. */
  static async list(tenantId: string, limit = 100, onlyNormalized: string[] = []): Promise<EnginePartsWithoutPrice> {
    const take = Math.max(1, Math.min(200, Math.trunc(limit) || 100));
    const restrict = onlyNormalized.length ? Prisma.sql`AND i."normalizedNumber" = ANY(${onlyNormalized}::text[])` : Prisma.empty;

    const items = await prisma.$queryRaw<Row[]>`
      SELECT
        MIN(i."partNumber") AS "partNumber",
        MIN(i."name") AS "name",
        ARRAY_AGG(DISTINCT i."source") AS "sources",
        COUNT(DISTINCT i."normalizedEngine") AS "engines",
        (ARRAY_AGG(DISTINCT i."engineModel"))[1:3] AS "engineExamples"
      FROM "OfficialPartIndex" i
      WHERE NOT EXISTS (
        SELECT 1 FROM "MasterPart" m
        WHERE m."tenantId" = ${tenantId}
          AND m."normalizedNumber" = i."normalizedNumber"
          AND m."price" IS NOT NULL
          AND m."price" > 0
      )
      ${restrict}
      GROUP BY i."normalizedNumber"
      ORDER BY COUNT(DISTINCT i."normalizedEngine") DESC, MIN(i."name") ASC
      LIMIT ${take}
    `;

    const totalRows = await prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
      SELECT COUNT(DISTINCT i."normalizedNumber") AS "total"
      FROM "OfficialPartIndex" i
      WHERE NOT EXISTS (
        SELECT 1 FROM "MasterPart" m
        WHERE m."tenantId" = ${tenantId}
          AND m."normalizedNumber" = i."normalizedNumber"
          AND m."price" IS NOT NULL
          AND m."price" > 0
      )
      ${restrict}
    `);

    return {
      total: Number(totalRows[0]?.total ?? 0),
      items: items.map(row => ({
        partNumber: row.partNumber,
        name: row.name,
        sources: row.sources,
        engines: Number(row.engines),
        engineExamples: row.engineExamples ?? [],
      })),
    };
  }
}
