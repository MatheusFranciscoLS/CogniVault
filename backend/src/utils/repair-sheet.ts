import * as XLSX from 'xlsx';
import { roundMoney, type QuoteItemInput } from '../services/quote.service';

// Leitor das planilhas "ORÇAMENTO DAV ####.xlsx" que a loja guarda numa pasta (uma por OS do Clipp, 2019 até hoje). PURO: recebe os bytes e o nome do
// arquivo e devolve as linhas do orçamento de conserto ou o motivo de não servir. Medido em 1.727 planilhas reais (2026-10-09):
//  - o orçamento está na aba "BASE ORÇAMENTO" (as outras abas, PLAN#/COTAÇÃO/CUSTO, são conta de custo e nunca entram);
//  - o prazo mora na coluna PRAZO ou ESTOQUE (as duas são o mesmo dado); LOC/LOCAÇÃO é a prateleira da peça (entra como `location`, só do balcão);
//    as colunas de fornecedor (COOPER, VIPECAS, RR...) são custo e NUNCA entram;
//  - "~$ORÇAMENTO DAV 123.xlsx" é o arquivo temporário que o Excel deixa aberto, não um orçamento;
//  - o prazo às vezes vira data do Excel ("44927"), o que não é prazo.
// **Nenhum custo nem aba interna sai daqui.** O número da OS vem do NOME do arquivo.

export const MAX_REPAIR_SHEET_BYTES = 600 * 1024;
const MAX_ROWS = 400;
const MAX_ITEMS = 120;

export interface RepairSheetOk {
  status: 'OK';
  dav: string;
  items: QuoteItemInput[];
  total: number;
  /** O total que a planilha escreve, quando existe. */
  sheetTotal: number | null;
  /** Avisos que não impedem a importação (preço em branco, quantidade quebrada, total diferente). */
  notes: string[];
}
export type RepairSheetResult =
  | RepairSheetOk
  | { status: 'SKIPPED'; reason: 'TEMPORARIO' | 'SEM_NUMERO' }
  | { status: 'PROBLEM'; dav: string | null; reason: string };

const norm = (value: unknown): string => String(value ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** O número da OS do nome do arquivo ("ORÇAMENTO DAV 59600.xlsx", "ORCAMENTO_DAV_59600 (1).xls"). */
export function davFromFileName(fileName: string): string | null {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const match = /DAV[_ ]*(\d{3,7})/i.exec(base);
  return match ? String(Number(match[1])) : null;
}

/** O prazo como o balcão escreve vira o texto do sistema: estoque = "Pronta entrega"; número solto (data do Excel) não é prazo. */
export function normalizeRepairLeadTime(value: unknown): string | undefined {
  if (value === null || value === undefined || typeof value === 'number' || value instanceof Date) return undefined;
  const text = String(value).trim().replace(/\s+/g, ' ');
  if (!text) return undefined;
  const key = norm(text);
  if (/^(IMEDIAT[OA]|DISPONIVEL|EM ESTOQUE|ESTOQUE|PRONTA ENTREGA)$/.test(key)) return 'Pronta entrega';
  if (/^\d{4,}$/.test(key)) return undefined;
  const lower = text.toLowerCase().slice(0, 60);
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Número como a planilha escreve: 27, "27,5", "R$ 1.234,56". O que não é número devolve NaN. */
export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return Number.NaN;
  let text = value.trim().replace(/^R\$\s*/i, '').replace(/\s+/g, '');
  if (!/^-?[\d.,]+$/.test(text)) return Number.NaN;
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  return Number(text);
}

/** Prateleira como está na planilha ("P14-C2", "PF"); vazio e o traço de "sem local" viram nulo. */
export function cleanLocation(value: unknown): string | null {
  if (value === null || value === undefined || typeof value === 'object') return null;
  const text = String(value).replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 40);
  return text && text !== '-' && text !== '--' ? text : null;
}

function cleanCode(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '').replace(/-/g, '').toUpperCase().slice(0, 80);
}

export function parseRepairSheet(bytes: Buffer, fileName: string): RepairSheetResult {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  if (base.startsWith('~$')) return { status: 'SKIPPED', reason: 'TEMPORARIO' };
  const dav = davFromFileName(base);
  if (!dav) return { status: 'SKIPPED', reason: 'SEM_NUMERO' };
  if (bytes.length > MAX_REPAIR_SHEET_BYTES) return { status: 'PROBLEM', dav, reason: 'arquivo grande demais' };

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: 'buffer', sheetRows: MAX_ROWS, cellFormula: false, cellHTML: false });
  } catch {
    return { status: 'PROBLEM', dav, reason: 'não consegui abrir o arquivo' };
  }
  const sheetName = workbook.SheetNames.find(name => /BASE OR[CÇ]AMENTO/i.test(name)) ?? workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) return { status: 'PROBLEM', dav, reason: 'planilha vazia' };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });

  // A linha do cabeçalho é a que tem VALOR UNIT e QTDE (ou DESCRIÇÃO). Há planilha com "XZ" no lugar de DESCRIÇÃO: o nome é a coluna logo depois do código.
  const headerIndex = rows.slice(0, 20).findIndex(row => row.some(cell => norm(cell).startsWith('VALOR UNIT')) && row.some(cell => /^QTDE?$/.test(norm(cell))));
  if (headerIndex < 0) return { status: 'PROBLEM', dav, reason: 'cabeçalho não encontrado' };
  const header = rows[headerIndex].map(norm);
  const find = (...names: string[]) => header.findIndex(cell => names.some(name => cell === name || cell.startsWith(name)));
  const codeColumn = find('CODIGO');
  const nameColumn = find('DESCRICAO') >= 0 ? find('DESCRICAO') : codeColumn >= 0 ? codeColumn + 1 : -1;
  const qtyColumn = header.findIndex(cell => /^QTDE?$/.test(cell));
  const unitColumn = find('VALOR UNIT');
  const totalColumn = find('VALOR TOTAL');
  const locationColumn = header.findIndex(cell => /^LOC(ACAO)?$/.test(cell));
  const leadColumn = (() => { const prazo = find('PRAZO'); return prazo >= 0 ? prazo : find('ESTOQUE'); })();
  if (nameColumn < 0 || unitColumn < 0) return { status: 'PROBLEM', dav, reason: 'colunas de descrição e valor não encontradas' };

  const items: QuoteItemInput[] = [];
  const notes: string[] = [];
  let sheetTotal: number | null = null;
  let semValor = 0;
  let quantidadeAjustada = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const name = String(row[nameColumn] ?? '').replace(/\s+/g, ' ').trim();
    if (!name) {
      if (norm(row[unitColumn]) === 'TOTAL' && totalColumn >= 0) {
        const written = toNumber(row[totalColumn]);
        if (Number.isFinite(written)) sheetTotal = roundMoney(written);
        // O orçamento termina no TOTAL: o que vem depois são linhas soltas (rascunho, conta de custo) que a fórmula do total nunca somou.
        break;
      }
      continue;
    }
    if (/^VALOR/.test(norm(row[unitColumn])) || /^QTDE?$/.test(norm(qtyColumn >= 0 ? row[qtyColumn] : null))) continue;
    const unit = toNumber(row[unitColumn]);
    const hasPrice = Number.isFinite(unit) && unit > 0 && unit < 10_000_000;
    if (!hasPrice) semValor += 1;
    // Quantidade em branco vale 1 (é como a loja preenche); só avisa quando há um número que não serve (0, fração).
    const rawCell = qtyColumn >= 0 ? row[qtyColumn] : null;
    const blankQty = rawCell === null || rawCell === undefined || String(rawCell).trim() === '';
    const rawQty = blankQty ? 1 : toNumber(rawCell);
    let quantity = 1;
    let unitPrice = hasPrice ? roundMoney(unit) : null;
    let displayName = name;
    if (Number.isFinite(rawQty) && rawQty >= 1 && Number.isInteger(rawQty)) {
      quantity = Math.min(9999, rawQty);
    } else if (!blankQty) {
      // Litro de óleo (0,3; 1,2): a quantidade do sistema é inteira, então a linha vira 1 unidade com o valor da quantidade inteira e a descrição
      // guarda a quantidade original. O total do orçamento continua o mesmo.
      quantidadeAjustada += 1;
      if (Number.isFinite(rawQty) && rawQty > 0 && rawQty < 10_000) {
        if (unitPrice !== null) unitPrice = roundMoney(rawQty * unitPrice);
        displayName = `${name} (${String(Math.round(rawQty * 1000) / 1000).replace('.', ',')})`;
      }
    }
    const code = codeColumn >= 0 ? cleanCode(row[codeColumn]) : '';
    const isLabor = /M[AÃ]O.?DE.?OBRA/i.test(name);
    const leadTime = leadColumn >= 0 ? normalizeRepairLeadTime(row[leadColumn]) : undefined;
    const location = locationColumn >= 0 ? cleanLocation(row[locationColumn]) : null;
    items.push({
      partNumber: code && !isLabor ? code : `SRV-${items.length + 1}`,
      effectiveCode: code && !isLabor ? code : null,
      name: displayName.slice(0, 400),
      model: null,
      isService: !code || isLabor,
      leadTime: leadTime ?? null,
      location,
      quantity,
      unitPrice,
    });
    if (items.length > MAX_ITEMS) return { status: 'PROBLEM', dav, reason: `mais de ${MAX_ITEMS} linhas` };
  }
  if (!items.length) return { status: 'PROBLEM', dav, reason: 'nenhuma linha de peça' };

  const total = roundMoney(items.reduce((sum, item) => sum + item.quantity * (item.unitPrice ?? 0), 0));
  if (semValor) notes.push(`${semValor} ${semValor === 1 ? 'linha sem valor' : 'linhas sem valor'}`);
  if (quantidadeAjustada) notes.push(`${quantidadeAjustada} ${quantidadeAjustada === 1 ? 'quantidade quebrada convertida' : 'quantidades quebradas convertidas'} (ex.: litros)`);
  if (sheetTotal !== null && Math.abs(sheetTotal - total) > 0.011) notes.push('o total escrito na planilha é diferente da soma das linhas');
  return { status: 'OK', dav, items, total, sheetTotal, notes };
}
