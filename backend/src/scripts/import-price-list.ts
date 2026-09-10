import { randomUUID } from 'crypto';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';

const prisma = new PrismaClient();

type ExcelRow = Record<string, unknown>;

type SheetConfig = {
  sheet: string;
  commercialCategory: string;
};

type CommercialOccurrence = {
  normalizedNumber: string;
  partNumber: string;
  name: string;
  application: string | null;
  applicationKey: string;
  commercialCategory: string;
  subCategory: string | null;
  reference: string | null;
  itemType: string | null;
  sourceSheet: string;
  sourceRow: number;
  price: number | null;
  ncm: string | null;
};

type MasterImport = {
  tenantId: string;
  normalizedNumber: string;
  partNumber: string;
  name: string;
  description: string | null;
  price: number | null;
  ncm: string | null;
  ean: string | null;
  category: string | null;
  brand: string | null;
};

const COMMERCIAL_SHEETS: SheetConfig[] = [
  { sheet: 'LISTA_DE_PEÇAS', commercialCategory: 'PEÇAS DE REPOSIÇÃO GERAL' },
  { sheet: 'PEÇAS_TURFCARE', commercialCategory: 'PEÇAS PARA CORTADORES DE GRAMA GIRO ZERO' },
  { sheet: 'PEÇAS_MOTORES', commercialCategory: 'PEÇAS PARA MOTORES 4 TEMPOS' },
  { sheet: 'PEÇAS_BATERIA', commercialCategory: 'PEÇAS PARA PRODUTOS A BATERIA' },
  { sheet: 'PEÇAS_AUTOMOWER', commercialCategory: 'PEÇAS PARA CORTADORES DE GRAMA AUTOMOWER' },
  { sheet: 'PEÇAS_MARCAS', commercialCategory: 'PEÇAS DE REPOSIÇÃO DE OUTRAS MARCAS' },
  { sheet: 'FERRAMENTAS', commercialCategory: 'FERRAMENTAS' },
];

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function asNullableText(value: unknown): string | null {
  const text = asText(value);
  return text && text !== '-' ? text : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = typeof value === 'string'
    ? value.replace(/\./g, '').replace(',', '.')
    : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIdentifier(value: unknown): string {
  return asText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

function firstValue(row: ExcelRow, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && asText(row[key])) return row[key];
  }
  return undefined;
}

function readRows(workbook: xlsx.WorkBook, sheetName: string, range: number): ExcelRow[] {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error(`Aba "${sheetName}" não encontrada na planilha.`);
  return xlsx.utils.sheet_to_json<ExcelRow>(worksheet, { range, defval: null, raw: true });
}

function resolveExcelPath(): string {
  const fileArg = process.argv.slice(2).find(arg => !arg.startsWith('--'));
  const configured = fileArg || process.env.PRICE_LIST_PATH || '../Lista de Preços_Julho_2026_V2.xlsm';
  return path.resolve(process.cwd(), configured);
}

async function resolveTenant(): Promise<{ id: string; name: string }> {
  const tenantArg = process.argv.slice(2).find(arg => arg.startsWith('--tenant='));
  const tenantId = tenantArg?.slice('--tenant='.length).trim();

  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
    if (!tenant) throw new Error(`Tenant ${tenantId} não encontrado.`);
    return tenant;
  }

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });
  if (tenants.length === 1) return tenants[0];
  if (!tenants.length) throw new Error('Nenhum tenant encontrado no banco.');

  throw new Error(
    `Existem ${tenants.length} tenants. Informe explicitamente --tenant=<id> para não importar no cliente errado.`,
  );
}

function loadEanMap(workbook: xlsx.WorkBook): Map<string, string> {
  const map = new Map<string, string>();
  const worksheet = workbook.Sheets.EAN;
  if (!worksheet) return map;

  const rows = xlsx.utils.sheet_to_json<ExcelRow>(worksheet, { defval: null, raw: true });
  for (const row of rows) {
    const code = normalizeIdentifier(firstValue(row, ['CÓDIGO', 'Código']));
    const ean = asText(firstValue(row, ['EAN', 'Ean']));
    if (code && ean) map.set(code, ean);
  }
  return map;
}

function loadCommercialOccurrences(workbook: xlsx.WorkBook): CommercialOccurrence[] {
  const occurrences: CommercialOccurrence[] = [];

  for (const config of COMMERCIAL_SHEETS) {
    // Todas as sete abas comerciais usam a linha 6 como cabeçalho.
    const rows = readRows(workbook, config.sheet, 5);

    rows.forEach((row, index) => {
      const rawPartNumber = asText(firstValue(row, ['CÓDIGO', 'Código']));
      const normalizedNumber = normalizeIdentifier(rawPartNumber);
      if (!normalizedNumber) return;

      const application = asNullableText(firstValue(row, ['MODELO/APLICAÇÃO', 'MODELO', 'Modelo/Aplicação', 'Modelo']));
      const name = asText(firstValue(row, ['DESCRIÇÃO', 'Descrição'])) || rawPartNumber;

      occurrences.push({
        normalizedNumber,
        partNumber: rawPartNumber,
        name,
        application,
        applicationKey: normalizeIdentifier(application),
        commercialCategory: config.commercialCategory,
        subCategory: asNullableText(firstValue(row, ['CATEGORIA', 'Categoria'])),
        reference: asNullableText(firstValue(row, ['REFERÊNCIA', 'Referência'])),
        itemType: asNullableText(firstValue(row, ['TIPO', 'Tipo'])),
        sourceSheet: config.sheet,
        sourceRow: index + 7,
        price: asNumber(firstValue(row, ['PREÇO COM IMPOSTO', 'Preço com Imposto', 'PREÇO'])),
        ncm: asNullableText(firstValue(row, ['NCM', 'Classific. Fiscal'])),
      });
    });

    console.log(`✓ ${config.sheet}: ${rows.length.toLocaleString('pt-BR')} linhas lidas.`);
  }

  return occurrences;
}

function buildMasterParts(
  workbook: xlsx.WorkBook,
  tenantId: string,
  occurrences: CommercialOccurrence[],
  eanMap: Map<string, string>,
): MasterImport[] {
  const occurrencesByCode = new Map<string, CommercialOccurrence[]>();
  for (const occurrence of occurrences) {
    const group = occurrencesByCode.get(occurrence.normalizedNumber) || [];
    group.push(occurrence);
    occurrencesByCode.set(occurrence.normalizedNumber, group);
  }

  const baseRows = readRows(workbook, 'BASE_DADOS CADASTRAIS', 2);
  const baseByCode = new Map<string, ExcelRow>();

  for (const row of baseRows) {
    const normalized = normalizeIdentifier(firstValue(row, ['Código', 'CÓDIGO']));
    if (normalized) baseByCode.set(normalized, row);
  }

  const result: MasterImport[] = [];

  // A lista comercial (as sete categorias mostradas no sistema) define quais
  // códigos pertencem ao catálogo comercial de peças/ferramentas vigente.
  for (const [normalizedNumber, codeOccurrences] of occurrencesByCode) {
    const primary = codeOccurrences.find(item => item.itemType?.toLowerCase() === 'base') || codeOccurrences[0];
    const base = baseByCode.get(normalizedNumber);

    const baseCode = asText(firstValue(base || {}, ['Código', 'CÓDIGO']));
    const baseName = asText(firstValue(base || {}, ['Descrição', 'DESCRIÇÃO']));
    const basePrice = asNumber(firstValue(base || {}, ['Preço', 'PREÇO']));
    const baseNcm = asNullableText(firstValue(base || {}, ['Classific. Fiscal', 'NCM']));
    const baseEan = asNullableText(firstValue(base || {}, ['EAN']));

    result.push({
      tenantId,
      normalizedNumber,
      partNumber: baseCode || primary.partNumber,
      name: baseName || primary.name,
      description: baseName || primary.name || null,
      price: basePrice ?? primary.price,
      ncm: baseNcm ?? primary.ncm,
      ean: baseEan ?? eanMap.get(normalizedNumber) ?? null,
      category: primary.commercialCategory,
      // O campo legado "brand" passa a receber a referência/fabricante quando
      // a aba fornece esse dado. Aplicação fica na tabela relacional própria.
      brand: primary.reference,
    });
  }

  return result;
}

async function upsertMasterParts(items: MasterImport[], importDate: Date): Promise<void> {
  const batchSize = 250;

  for (let offset = 0; offset < items.length; offset += batchSize) {
    const batch = items.slice(offset, offset + batchSize);

    await prisma.$transaction(
      batch.map(item => prisma.masterPart.upsert({
        where: {
          tenantId_normalizedNumber: {
            tenantId: item.tenantId,
            normalizedNumber: item.normalizedNumber,
          },
        },
        update: {
          partNumber: item.partNumber,
          name: item.name,
          description: item.description,
          price: item.price,
          ncm: item.ncm,
          ean: item.ean,
          category: item.category,
          brand: item.brand,
          updatedAt: importDate,
        },
        create: {
          ...item,
          updatedAt: importDate,
        },
      })),
    );

    console.log(`  Cadastro comercial: ${Math.min(offset + batch.length, items.length).toLocaleString('pt-BR')}/${items.length.toLocaleString('pt-BR')}`);
  }
}

async function upsertApplications(
  tenantId: string,
  occurrences: CommercialOccurrence[],
  importDate: Date,
): Promise<void> {
  const batchSize = 400;

  for (let offset = 0; offset < occurrences.length; offset += batchSize) {
    const batch = occurrences.slice(offset, offset + batchSize);

    const values = Prisma.join(batch.map(item => Prisma.sql`(
      ${randomUUID()},
      ${tenantId},
      ${item.normalizedNumber},
      ${item.partNumber},
      ${item.application},
      ${item.applicationKey},
      ${item.commercialCategory},
      ${item.subCategory},
      ${item.reference},
      ${item.itemType},
      ${item.sourceSheet},
      ${item.sourceRow},
      ${importDate}
    )`));

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MasterPartApplication" (
        "id", "tenantId", "normalizedNumber", "partNumber", "application",
        "applicationKey", "commercialCategory", "subCategory", "reference",
        "itemType", "sourceSheet", "sourceRow", "updatedAt"
      )
      VALUES ${values}
      ON CONFLICT (
        "tenantId", "normalizedNumber", "applicationKey", "commercialCategory", "sourceSheet"
      ) DO UPDATE SET
        "partNumber" = EXCLUDED."partNumber",
        "application" = EXCLUDED."application",
        "subCategory" = EXCLUDED."subCategory",
        "reference" = EXCLUDED."reference",
        "itemType" = EXCLUDED."itemType",
        "sourceRow" = EXCLUDED."sourceRow",
        "updatedAt" = EXCLUDED."updatedAt"
    `);

    console.log(`  Aplicações: ${Math.min(offset + batch.length, occurrences.length).toLocaleString('pt-BR')}/${occurrences.length.toLocaleString('pt-BR')}`);
  }

  // Só depois de uma importação completa removemos relações que não existem
  // mais na lista atual. Se o processo falhar no meio, a base anterior continua íntegra.
  await prisma.$executeRaw`
    DELETE FROM "MasterPartApplication"
    WHERE "tenantId" = ${tenantId}
      AND "updatedAt" < ${importDate}
  `;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log('Uso: npm run import:price-list -- <arquivo.xlsm> [--tenant=<uuid>] [--dry-run]');
    return;
  }

  const excelPath = resolveExcelPath();
  const dryRun = process.argv.includes('--dry-run');
  const startedAt = new Date();

  console.log('\nCogniVault · Importação da lista de preços');
  console.log(`Arquivo: ${excelPath}`);
  console.log('O Excel é usado apenas nesta ingestão; a aplicação consulta o PostgreSQL depois.\n');

  const workbook = xlsx.readFile(excelPath, { cellDates: false });
  const tenant = await resolveTenant();
  const eanMap = loadEanMap(workbook);
  const occurrences = loadCommercialOccurrences(workbook);
  const masterParts = buildMasterParts(workbook, tenant.id, occurrences, eanMap);

  console.log('\nResumo antes de gravar:');
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`Linhas comerciais: ${occurrences.length.toLocaleString('pt-BR')}`);
  console.log(`Códigos únicos: ${masterParts.length.toLocaleString('pt-BR')}`);
  console.log(`EANs auxiliares: ${eanMap.size.toLocaleString('pt-BR')}`);

  if (dryRun) {
    console.log('\n--dry-run ativo: nenhuma alteração foi feita no banco.');
    return;
  }

  await upsertMasterParts(masterParts, startedAt);
  await upsertApplications(tenant.id, occurrences, startedAt);

  const [masterCount, applicationCount] = await Promise.all([
    prisma.masterPart.count({ where: { tenantId: tenant.id } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "MasterPartApplication"
      WHERE "tenantId" = ${tenant.id}
    `,
  ]);

  console.log('\n✓ Importação concluída.');
  console.log(`MasterPart no banco: ${masterCount.toLocaleString('pt-BR')}`);
  console.log(`Aplicações comerciais vigentes: ${Number(applicationCount[0]?.count || 0).toLocaleString('pt-BR')}`);
  console.log('O arquivo Excel não é necessário para buscas após esta etapa.\n');
}

main()
  .catch(error => {
    console.error('\n✗ Falha na importação:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
