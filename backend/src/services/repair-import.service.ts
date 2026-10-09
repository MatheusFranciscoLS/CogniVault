import { prisma } from '../config/prisma';
import { MAX_REPAIR_SHEET_BYTES, parseRepairSheet, type RepairSheetResult } from '../utils/repair-sheet';
import { QUOTE_TX_OPTIONS, computeTotals, itemRows } from './quote.service';

// Importação dos orçamentos de conserto antigos ("ORÇAMENTO DAV ####.xlsx") para a pasta da aba Conserto (2026-10-09). O balcão manda os arquivos em
// lotes pequenos (a tela lê a pasta); o servidor LÊ as planilhas (`preview`, só relatório) e só grava (`apply`) o que o relatório mostrou.
// Regras: nunca apaga e nunca sobrescreve (OS que já existe fica como está); entra SEM cliente (a planilha não tem) e SEM atendente, com a data do
// arquivo; só linhas, prazos e valores (nenhum custo, prateleira nem aba interna: ver `utils/repair-sheet.ts`).

export const MAX_IMPORT_FILES_PER_BATCH = 30;

export interface RepairImportFile {
  name: string;
  /** Data de modificação do arquivo (ms), que vira a data do orçamento. */
  modifiedAt: number;
  /** Conteúdo em base64. */
  data: string;
}

export type RepairImportStatus = 'OK' | 'EXISTS' | 'SKIPPED' | 'PROBLEM';

export interface RepairImportEntry {
  name: string;
  status: RepairImportStatus;
  dav?: string;
  /** Por que não entra (SKIPPED/PROBLEM) ou o que já existe. */
  reason?: string;
  items?: number;
  total?: number;
  notes?: string[];
}

export interface RepairImportReport {
  entries: RepairImportEntry[];
  ok: number;
  exists: number;
  skipped: number;
  problems: number;
}

export class RepairImportApprovalError extends Error {}

interface Parsed {
  file: RepairImportFile;
  result: RepairSheetResult | { status: 'PROBLEM'; dav: null; reason: string };
}

function parseFiles(files: RepairImportFile[]): Parsed[] {
  return files.map(file => {
    const bytes = Buffer.from(file.data, 'base64');
    if (bytes.length > MAX_REPAIR_SHEET_BYTES) return { file, result: { status: 'PROBLEM', dav: null, reason: 'arquivo grande demais' } };
    return { file, result: parseRepairSheet(bytes, file.name) };
  });
}

/** Marca como EXISTS a OS que já está na pasta e a repetida dentro do próprio lote (vale a primeira). */
async function classify(tenantId: string, parsed: Parsed[]): Promise<Array<{ parsed: Parsed; entry: RepairImportEntry }>> {
  const davs = parsed.flatMap(item => (item.result.status === 'OK' ? [item.result.dav] : []));
  const existing = new Set(
    davs.length
      ? (await prisma.quote.findMany({ where: { tenantId, kind: 'REPAIR', status: 'SAVED', docNumber: { in: davs } }, select: { docNumber: true } })).map(quote => quote.docNumber ?? '')
      : [],
  );
  const seen = new Set<string>();
  return parsed.map(item => {
    const { file, result } = item;
    if (result.status === 'SKIPPED') return { parsed: item, entry: { name: file.name, status: 'SKIPPED' as const, reason: result.reason === 'TEMPORARIO' ? 'arquivo temporário do Excel' : 'o nome não tem o número da OS' } };
    if (result.status === 'PROBLEM') return { parsed: item, entry: { name: file.name, status: 'PROBLEM' as const, dav: result.dav ?? undefined, reason: result.reason } };
    if (existing.has(result.dav) || seen.has(result.dav)) return { parsed: item, entry: { name: file.name, status: 'EXISTS' as const, dav: result.dav, reason: 'a OS já está na pasta' } };
    seen.add(result.dav);
    return { parsed: item, entry: { name: file.name, status: 'OK' as const, dav: result.dav, items: result.items.length, total: result.total, notes: result.notes } };
  });
}

function report(entries: RepairImportEntry[]): RepairImportReport {
  const count = (status: RepairImportStatus) => entries.filter(entry => entry.status === status).length;
  return { entries, ok: count('OK'), exists: count('EXISTS'), skipped: count('SKIPPED'), problems: count('PROBLEM') };
}

function quoteDate(modifiedAt: number): Date {
  const date = new Date(modifiedAt);
  const now = Date.now();
  return Number.isFinite(date.getTime()) && date.getTime() > Date.UTC(2000, 0, 1) && date.getTime() < now + 24 * 3600 * 1000 ? date : new Date(now);
}

/** Só LÊ: diz o que cada arquivo vai virar. */
export async function previewRepairImport(tenantId: string, files: RepairImportFile[]): Promise<RepairImportReport> {
  const classified = await classify(tenantId, parseFiles(files));
  return report(classified.map(item => item.entry));
}

/** Grava os arquivos `OK` do lote, desde que sejam tantos quantos o relatório aprovado mostrou. */
export async function applyRepairImport(tenantId: string, files: RepairImportFile[], expectOk: number): Promise<RepairImportReport & { created: number }> {
  const classified = await classify(tenantId, parseFiles(files));
  const entries = classified.map(item => item.entry);
  const toCreate = classified.filter(item => item.entry.status === 'OK' && item.parsed.result.status === 'OK');
  if (toCreate.length !== expectOk) {
    throw new RepairImportApprovalError(`O lote tem ${toCreate.length} orçamento(s) para gravar, mas o relatório aprovado dizia ${expectOk}. Nada foi gravado.`);
  }
  await prisma.$transaction(async tx => {
    for (const { parsed } of toCreate) {
      const result = parsed.result;
      if (result.status !== 'OK') continue;
      const when = quoteDate(parsed.file.modifiedAt);
      await tx.quote.create({
        data: {
          tenantId,
          userId: null,
          status: 'SAVED',
          kind: 'REPAIR',
          docNumber: result.dav,
          savedAt: when,
          createdAt: when,
          paymentMethod: null,
          discountPercentage: 0,
          ...computeTotals(result.items, 0),
          items: { create: itemRows(result.items) },
        },
      });
    }
  }, { ...QUOTE_TX_OPTIONS, timeout: 60_000 });
  return { ...report(entries), created: toCreate.length };
}
