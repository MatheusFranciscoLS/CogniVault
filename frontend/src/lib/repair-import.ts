// Importação dos orçamentos de conserto antigos ("ORÇAMENTO DAV ####.xlsx"): o que a tela decide ANTES de mandar ao servidor. O servidor é quem lê as
// planilhas (`backend/src/utils/repair-sheet.ts`); aqui só se escolhe quais arquivos vão, em lotes, e se monta o corpo da requisição.

export interface PickedFile {
  name: string;
  size: number;
  lastModified: number;
}

export interface ImportSelection<T extends PickedFile> {
  /** O que vai ao servidor: planilhas com o número da OS no nome, uma por OS (a mais nova). */
  send: T[];
  /** Fora da conta, e por quê: PDF/Word/Thumbs, arquivo temporário do Excel (`~$...`), nome sem número de OS, OS repetida (vale a mais nova). */
  notSpreadsheet: number;
  temporary: number;
  noNumber: number;
  repeated: number;
}

export const FILES_PER_BATCH = 25;
const SPREADSHEET = /\.(xlsx|xls)$/i;

/** O número da OS no nome do arquivo (mesma regra do servidor). */
export function davFromName(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? name;
  const match = /DAV[_ ]*(\d{3,7})/i.exec(base);
  return match ? String(Number(match[1])) : null;
}

export function selectImportable<T extends PickedFile>(files: readonly T[]): ImportSelection<T> {
  const result: ImportSelection<T> = { send: [], notSpreadsheet: 0, temporary: 0, noNumber: 0, repeated: 0 };
  const newest = new Map<string, T>();
  for (const file of files) {
    const base = file.name.split(/[\\/]/).pop() ?? file.name;
    if (!SPREADSHEET.test(base)) { result.notSpreadsheet += 1; continue; }
    if (base.startsWith('~$')) { result.temporary += 1; continue; }
    const dav = davFromName(base);
    if (!dav) { result.noNumber += 1; continue; }
    const current = newest.get(dav);
    if (!current) { newest.set(dav, file); continue; }
    result.repeated += 1;
    // A mais nova vale; empate, a maior (a que tem mais conteúdo).
    if (file.lastModified > current.lastModified || (file.lastModified === current.lastModified && file.size > current.size)) newest.set(dav, file);
  }
  result.send = [...newest.values()].sort((a, b) => Number(davFromName(a.name)) - Number(davFromName(b.name)));
  return result;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Base64 de bytes sem estourar a pilha de argumentos (arquivos de até algumas centenas de KB). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export type ImportEntry = {
  name: string;
  status: 'OK' | 'EXISTS' | 'SKIPPED' | 'PROBLEM';
  dav?: string;
  reason?: string;
  items?: number;
  total?: number;
  notes?: string[];
};

export interface ImportTotals {
  ok: number;
  exists: number;
  skipped: number;
  problems: number;
  /** Avisos por tipo ("linha sem valor", "total diferente", "quantidade quebrada"), contando arquivos. */
  warnings: Array<{ label: string; count: number }>;
  problemList: Array<{ name: string; reason: string }>;
}

/** Junta os relatórios de todos os lotes. O texto do aviso perde o número da frente ("2 linhas sem valor" e "1 linha sem valor" são o mesmo aviso). */
export function summarizeEntries(entries: readonly ImportEntry[]): ImportTotals {
  const totals: ImportTotals = { ok: 0, exists: 0, skipped: 0, problems: 0, warnings: [], problemList: [] };
  const warnings = new Map<string, number>();
  for (const entry of entries) {
    if (entry.status === 'OK') totals.ok += 1;
    else if (entry.status === 'EXISTS') totals.exists += 1;
    else if (entry.status === 'SKIPPED') totals.skipped += 1;
    else { totals.problems += 1; totals.problemList.push({ name: entry.name, reason: entry.reason ?? 'não consegui ler' }); }
    if (entry.status === 'OK') {
      for (const note of entry.notes ?? []) {
        const label = /sem valor/.test(note) ? 'com linha sem valor' : /total escrito/.test(note) ? 'com o total diferente da soma das linhas' : /quantidade/.test(note) ? 'com quantidade quebrada (litros) convertida' : note;
        warnings.set(label, (warnings.get(label) ?? 0) + 1);
      }
    }
  }
  totals.warnings = [...warnings.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  return totals;
}
