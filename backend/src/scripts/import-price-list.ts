import 'dotenv/config';
import { randomUUID } from 'crypto';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

const BASE_SHEET = 'BASE_DADOS CADASTRAIS';
const EAN_SHEET = 'EAN';
const BATCH_SIZE = 400;
const COMMERCIAL_PRICE_DIVISOR = 0.92;

const PRICE_SECTIONS = [
  { sheet: 'LISTA_DE_PEÇAS', section: 'PEÇAS DE REPOSIÇÃO GERAL' },
  { sheet: 'PEÇAS_TURFCARE', section: 'PEÇAS PARA CORTADORES DE GRAMA GIRO ZERO' },
  { sheet: 'PEÇAS_MOTORES', section: 'PEÇAS PARA MOTORES 4 TEMPOS' },
  { sheet: 'PEÇAS_BATERIA', section: 'PEÇAS PARA PRODUTOS A BATERIA' },
  { sheet: 'PEÇAS_AUTOMOWER', section: 'PEÇAS PARA CORTADORES DE GRAMA AUTOMOWER' },
  { sheet: 'PEÇAS_MARCAS', section: 'PEÇAS DE REPOSIÇÃO DE OUTRAS MARCAS' },
  { sheet: 'FERRAMENTAS', section: 'FERRAMENTAS' },
] as const;

type Row = Record<string, unknown>;

type CommercialOccurrence = {
  normalizedNumber: string;
  partNumber: string;
  name: string;
  section: string;
  application: string | null;
  applicationKey: string;
  reference: string | null;
  productCategory: string | null;
  itemType: string | null;
  groupCode: string | null;
  sourceSheet: string;
  price: number | null;
  ncm: string | null;
};

type MasterRecord = {
  partNumber: string;
  normalizedNumber: string;
  name: string;
  description: string | null;
  price: number | null;
  ncm: string | null;
  ean: string | null;
  category: string | null;
  brand: string | null;
};

function value(row: Row, ...keys: string[]): unknown {
  for (const key of keys) {
    const found = row[key];
    if (found !== undefined && found !== null && String(found).trim() !== '') return found;
  }
  return null;
}

function text(input: unknown): string | null {
  if (input === undefined || input === null) return null;
  const result = String(input).replace(/\s+/g, ' ').trim();
  return result && result !== '-' ? result : null;
}

function numberValue(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  const raw = text(input);
  if (!raw) return null;

  const normalized = raw
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function commercialPrice(input: number | null): number | null {
  if (input === null) return null;
  return Math.round((input / COMMERCIAL_PRICE_DIVISOR) * 100) / 100;
}

function normalizeIdentifier(input: unknown): string {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

function readRows(workbook: XLSX.WorkBook, sheetName: string, range: number): Row[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Aba "${sheetName}" não encontrada no arquivo.`);

  return XLSX.utils.sheet_to_json<Row>(sheet, {
    range,
    defval: null,
    raw: true,
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function resolveExcelPath(): string {
  const fileArg = process.argv.slice(2).find(argument => !argument.startsWith('--'));
  const configured = fileArg || process.env.PRICE_LIST_PATH || '../Lista de Preços_Julho_2026_V2.xlsm';
  return path.resolve(process.cwd(), configured);
}

async function resolveTenant(): Promise<{ id: string; name: string }> {
  const tenantArg = process.argv.find(argument => argument.startsWith('--tenant='));
  const tenantNameArg = process.argv.find(argument => argument.startsWith('--tenant-name='));

  if (tenantArg) {
    const id = tenantArg.slice('--tenant='.length).trim();
    const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!tenant) throw new Error(`Tenant ${id} não encontrado.`);
    return tenant;
  }

  if (tenantNameArg) {
    const name = tenantNameArg.slice('--tenant-name='.length).trim();
    const tenant = await prisma.tenant.findFirst({ where: { name }, select: { id: true, name: true } });
    if (!tenant) throw new Error(`Tenant "${name}" não encontrado.`);
    return tenant;
  }

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  if (tenants.length === 1) return tenants[0];
  if (!tenants.length) throw new Error('Nenhum tenant encontrado no banco.');

  throw new Error(
    `Existem ${tenants.length} tenants. Use --tenant=<uuid> ou --tenant-name="Nome" para evitar importar no cliente errado.`,
  );
}

function loadEanMap(workbook: XLSX.WorkBook): Map<string, string> {
  const sheet = workbook.Sheets[EAN_SHEET];
  const result = new Map<string, string>();
  if (!sheet) return result;

  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, raw: true });

  for (const row of rows) {
    const partNumber = text(value(row, 'CÓDIGO', 'Código', 'CODIGO'));
    const ean = text(value(row, 'EAN'));
    if (!partNumber || !ean) continue;

    const normalizedNumber = normalizeIdentifier(partNumber);
    if (normalizedNumber) result.set(normalizedNumber, ean);
  }

  return result;
}

function loadBaseMap(workbook: XLSX.WorkBook): Map<string, Row> {
  const result = new Map<string, Row>();
  for (const row of readRows(workbook, BASE_SHEET, 2)) {
    const partNumber = text(value(row, 'Código', 'CÓDIGO', 'CODIGO'));
    if (!partNumber) continue;

    const normalizedNumber = normalizeIdentifier(partNumber);
    if (normalizedNumber) result.set(normalizedNumber, row);
  }
  return result;
}

function loadCommercialOccurrences(workbook: XLSX.WorkBook): CommercialOccurrence[] {
  const occurrences: CommercialOccurrence[] = [];

  for (const config of PRICE_SECTIONS) {
    const rows = readRows(workbook, config.sheet, 5);
    let validRows = 0;

    for (const row of rows) {
      const partNumber = text(value(row, 'CÓDIGO', 'Código', 'CODIGO'));
      if (!partNumber) continue;

      const normalizedNumber = normalizeIdentifier(partNumber);
      if (!normalizedNumber) continue;

      const application = text(value(row, 'MODELO/APLICAÇÃO', 'MODELO', 'MODELO / APLICAÇÃO'));
      const name = text(value(row, 'DESCRIÇÃO', 'Descrição', 'DESCRICAO')) || partNumber;

      occurrences.push({
        normalizedNumber,
        partNumber,
        name,
        section: config.section,
        application,
        applicationKey: normalizeIdentifier(application),
        reference: text(value(row, 'REFERÊNCIA', 'REFERENCIA')),
        productCategory: text(value(row, 'CATEGORIA')),
        itemType: text(value(row, 'TIPO', 'Tipo')),
        groupCode: text(value(row, 'GRUPO', 'Grupo')),
        sourceSheet: config.sheet,
        price: numberValue(value(row, 'PREÇO COM IMPOSTO', 'Preço com Imposto', 'PREÇO', 'PRECO')),
        ncm: text(value(row, 'NCM', 'Classific. Fiscal')),
      });
      validRows += 1;
    }

    console.log(`${config.sheet}: ${validRows.toLocaleString('pt-BR')} linhas válidas`);
  }

  return occurrences;
}

function buildRecords(
  baseByCode: Map<string, Row>,
  eanMap: Map<string, string>,
  occurrences: CommercialOccurrence[],
): { masters: MasterRecord[]; sections: CommercialOccurrence[] } {
  const occurrenceGroups = new Map<string, CommercialOccurrence[]>();

  for (const occurrence of occurrences) {
    const group = occurrenceGroups.get(occurrence.normalizedNumber) || [];
    group.push(occurrence);
    occurrenceGroups.set(occurrence.normalizedNumber, group);
  }

  const masters: MasterRecord[] = [];

  for (const [normalizedNumber, codeOccurrences] of occurrenceGroups) {
    const primary = codeOccurrences.find(item => item.itemType?.toLowerCase() === 'base') || codeOccurrences[0];
    const base = baseByCode.get(normalizedNumber);

    const basePartNumber = base ? text(value(base, 'Código', 'CÓDIGO', 'CODIGO')) : null;
    const baseName = base ? text(value(base, 'Descrição', 'DESCRIÇÃO', 'DESCRICAO')) : null;
    const basePrice = base ? numberValue(value(base, 'Preço', 'PREÇO', 'PRECO')) : null;
    const baseNcm = base ? text(value(base, 'Classific. Fiscal', 'NCM')) : null;
    const baseEan = base ? text(value(base, 'EAN')) : null;
    const sourcePrice = basePrice ?? primary.price;

    masters.push({
      partNumber: basePartNumber || primary.partNumber,
      normalizedNumber,
      name: baseName || primary.name,
      description: baseName || primary.name,
      price: commercialPrice(sourcePrice),
      ncm: baseNcm || primary.ncm,
      ean: baseEan || eanMap.get(normalizedNumber) || null,
      category: primary.section,
      brand: primary.reference,
    });
  }

  const uniqueSections = new Map<string, CommercialOccurrence>();
  for (const occurrence of occurrences) {
    const key = [
      occurrence.normalizedNumber,
      occurrence.section,
      occurrence.applicationKey,
    ].join('|');

    if (!uniqueSections.has(key)) uniqueSections.set(key, occurrence);
  }

  return { masters, sections: [...uniqueSections.values()] };
}

async function upsertMasterParts(tenantId: string, records: MasterRecord[], importDate: Date): Promise<void> {
  let processed = 0;

  for (const batch of chunk(records, BATCH_SIZE)) {
    const values = Prisma.join(batch.map(record => Prisma.sql`(
      ${randomUUID()},
      ${tenantId},
      ${record.partNumber},
      ${record.normalizedNumber},
      ${record.name},
      ${record.description},
      ${record.price},
      ${record.ncm},
      ${record.ean},
      ${record.category},
      ${record.brand},
      ${importDate}
    )`));

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MasterPart" (
        "id", "tenantId", "partNumber", "normalizedNumber", "name", "description",
        "price", "ncm", "ean", "category", "brand", "updatedAt"
      )
      VALUES ${values}
      ON CONFLICT ("tenantId", "normalizedNumber")
      DO UPDATE SET
        "partNumber" = EXCLUDED."partNumber",
        "name" = EXCLUDED."name",
        "description" = EXCLUDED."description",
        "price" = EXCLUDED."price",
        "ncm" = EXCLUDED."ncm",
        "ean" = COALESCE(EXCLUDED."ean", "MasterPart"."ean"),
        "category" = EXCLUDED."category",
        "brand" = EXCLUDED."brand",
        "updatedAt" = EXCLUDED."updatedAt"
    `);

    processed += batch.length;
    console.log(`MasterPart: ${processed.toLocaleString('pt-BR')}/${records.length.toLocaleString('pt-BR')}`);
  }
}

async function upsertSections(
  tenantId: string,
  records: CommercialOccurrence[],
  importDate: Date,
): Promise<void> {
  let processed = 0;

  for (const batch of chunk(records, BATCH_SIZE)) {
    const values = Prisma.join(batch.map(record => Prisma.sql`(
      ${randomUUID()},
      ${tenantId},
      ${record.normalizedNumber},
      ${record.section},
      ${record.application},
      ${record.applicationKey},
      ${record.reference},
      ${record.productCategory},
      ${record.itemType},
      ${record.groupCode},
      ${record.sourceSheet},
      ${importDate}
    )`));

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MasterPartSection" (
        "id", "tenantId", "normalizedNumber", "section", "application", "applicationKey",
        "reference", "productCategory", "itemType", "groupCode", "sourceSheet", "updatedAt"
      )
      VALUES ${values}
      ON CONFLICT ("tenantId", "normalizedNumber", "section", "applicationKey")
      DO UPDATE SET
        "application" = EXCLUDED."application",
        "reference" = EXCLUDED."reference",
        "productCategory" = EXCLUDED."productCategory",
        "itemType" = EXCLUDED."itemType",
        "groupCode" = EXCLUDED."groupCode",
        "sourceSheet" = EXCLUDED."sourceSheet",
        "updatedAt" = EXCLUDED."updatedAt"
    `);

    processed += batch.length;
    console.log(`Aplicações/categorias: ${processed.toLocaleString('pt-BR')}/${records.length.toLocaleString('pt-BR')}`);
  }

  await prisma.masterPartSection.deleteMany({
    where: {
      tenantId,
      updatedAt: { lt: importDate },
    },
  });

  await prisma.masterPart.deleteMany({
    where: {
      tenantId,
      sections: { none: {} },
    },
  });
}

async function run(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(
      'Uso: npm run import:price-list -- "C:\\caminho\\Lista.xlsm" [--tenant=UUID | --tenant-name="Nome"] [--dry-run]',
    );
    return;
  }

  const filePath = resolveExcelPath();
  const dryRun = process.argv.includes('--dry-run');
  const importDate = new Date();

  console.log('\nCogniVault · Importação do catálogo comercial');
  console.log(`Arquivo de entrada: ${filePath}`);
  console.log('O Excel será usado somente nesta ingestão. As buscas posteriores usam o PostgreSQL.');
  console.log(`Regra comercial de preço: valor da planilha ÷ ${COMMERCIAL_PRICE_DIVISOR}, arredondado em 2 casas.\n`);

  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const tenant = await resolveTenant();
  const eanMap = loadEanMap(workbook);
  const baseByCode = loadBaseMap(workbook);
  const occurrences = loadCommercialOccurrences(workbook);
  const { masters, sections } = buildRecords(baseByCode, eanMap, occurrences);

  console.log('\nResumo da importação:');
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`Linhas comerciais válidas: ${occurrences.length.toLocaleString('pt-BR')}`);
  console.log(`Códigos comerciais únicos: ${masters.length.toLocaleString('pt-BR')}`);
  console.log(`Aplicações/categorias únicas: ${sections.length.toLocaleString('pt-BR')}`);
  console.log(`EANs auxiliares disponíveis: ${eanMap.size.toLocaleString('pt-BR')}`);

  if (dryRun) {
    console.log('\n--dry-run ativo: nada foi gravado no banco.\n');
    return;
  }

  await upsertMasterParts(tenant.id, masters, importDate);
  await upsertSections(tenant.id, sections, importDate);

  const [masterCount, sectionCount] = await Promise.all([
    prisma.masterPart.count({ where: { tenantId: tenant.id } }),
    prisma.masterPartSection.count({ where: { tenantId: tenant.id } }),
  ]);

  console.log('\n✓ Importação concluída.');
  console.log(`Peças/ferramentas salvas no PostgreSQL: ${masterCount.toLocaleString('pt-BR')}`);
  console.log(`Aplicações/categorias salvas no PostgreSQL: ${sectionCount.toLocaleString('pt-BR')}`);
  console.log('O arquivo Excel não é necessário para a operação normal do CogniVault.\n');
}

run()
  .catch(error => {
    console.error('\n✗ Erro na importação da lista de preços:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
