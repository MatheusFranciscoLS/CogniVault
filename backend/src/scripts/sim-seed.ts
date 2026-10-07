// Loja simulada: catálogo técnico gerado da lista de preços REAL da Husqvarna (.html).
//
// SÓ para banco descartável de desenvolvimento. Recusa rodar sem SIM_SEED_ALLOWED=true e
// recusa host que não seja local. Cria, por modelo, um "catálogo" (Document) com as peças
// dele (Part), no formato que o sistema grava hoje, para a tela ser testada com volume e
// nomes reais em vez de três peças de teste. Não há PDF: a vista explodida em PDF não é
// simulada aqui.
//
// Uso: SIM_SEED_ALLOWED=true DATABASE_URL=postgresql://postgres:sim@127.0.0.1:54330/postgres \
//      npx tsx src/scripts/sim-seed.ts "<lista.html>" [--models=60]
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { prisma } from '../config/prisma';
import { extractCatalogJson } from './price-list-html';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';

const MAX_PARTS_PER_MODEL = 350;

function assertLocal(): void {
  const url = process.env.DATABASE_URL ?? '';
  const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  if (process.env.SIM_SEED_ALLOWED !== 'true') throw new Error('Defina SIM_SEED_ALLOWED=true (somente banco descartável).');
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) {
    throw new Error('Recusado: o banco não é local. A loja simulada nunca roda contra um host remoto.');
  }
}

type Row = { tecnologia?: string; categoria?: string; modelo?: string; pnc?: string; codigo?: string; descricao?: string };

async function main(): Promise<void> {
  assertLocal();
  const file = process.argv.slice(2).find(arg => !arg.startsWith('--'));
  if (!file) throw new Error('Informe o caminho da lista .html.');
  const modelLimit = Number(process.argv.find(arg => arg.startsWith('--models='))?.slice(9) ?? 60);

  const catalog = extractCatalogJson(readFileSync(file, 'utf8'));
  const rows = (catalog.pecas as Row[]).filter(row => row.modelo && row.pnc && row.codigo && row.descricao);

  const byModel = new Map<string, Row[]>();
  for (const row of rows) {
    const key = String(row.modelo).trim();
    byModel.set(key, [...(byModel.get(key) ?? []), row]);
  }
  const models = [...byModel.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, modelLimit);

  const tenant = await prisma.tenant.findFirstOrThrow();
  const categories = new Map<string, string>();
  let documents = 0;
  let parts = 0;

  for (const [model, modelRows] of models) {
    const categoryName = modelRows[0].categoria ? String(modelRows[0].categoria) : 'Outros';
    if (!categories.has(categoryName)) {
      const existing = await prisma.category.findFirst({ where: { tenantId: tenant.id, name: categoryName } });
      categories.set(categoryName, existing?.id ?? (await prisma.category.create({ data: { name: categoryName, tenantId: tenant.id } })).id);
    }

    const seen = new Set<string>();
    const unique = modelRows.filter(row => {
      const key = `${row.pnc}|${row.codigo}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_PARTS_PER_MODEL);

    const mainPnc = String(unique[0].pnc);
    const document = await prisma.document.create({
      data: {
        filename: `IPL ${model}.pdf`,
        url: `sim://${normalizeIdentifier(model)}`,
        status: 'COMPLETED',
        processingStage: 'READY_WITHOUT_EMBEDDINGS',
        manufacturer: 'Husqvarna',
        model,
        pnc: mainPnc,
        tenantId: tenant.id,
        categoryId: categories.get(categoryName)!,
        reviewStatus: 'READY',
      },
    });
    documents += 1;

    await prisma.part.createMany({
      data: unique.map((row, index) => {
        const name = String(row.descricao).trim();
        const code = String(row.codigo).trim();
        const pnc = String(row.pnc).trim();
        return {
          documentId: document.id,
          manufacturer: 'Husqvarna',
          normalizedManufacturer: 'HUSQVARNA',
          model,
          normalizedModel: normalizeIdentifier(model),
          pnc,
          normalizedPnc: normalizeIdentifier(pnc),
          universalAcrossPnc: false,
          section: 'PEÇAS',
          position: String((index % 40) + 1),
          name,
          normalizedName: normalizeIdentifier(name),
          alternativeNames: [] as string[],
          partNumber: code,
          normalizedPartNumber: normalizeIdentifier(code),
          page: Math.floor(index / 20) + 1,
          searchText: normalizeText(`${name} ${model} ${pnc} ${code}`),
          active: true,
        };
      }),
    });
    parts += unique.length;
  }

  console.log(JSON.stringify({ modelos: models.length, catalogos: documents, pecas: parts }));
}

main()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
