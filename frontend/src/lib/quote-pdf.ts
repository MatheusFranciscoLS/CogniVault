// O PDF que o CLIENTE recebe. Mesmos valores do texto do WhatsApp (lib/quote-message.ts): mesmo arredondamento
// do servidor, mesma validade, e nada interno do balcão (posição, seção, PNC).
//
// `jsPDF` e `autoTable` chegam por parâmetro porque são carregados sob demanda (a biblioteca pesa e só o
// orçamento usa); assim este arquivo não entra no pacote principal e dá para testar com os módulos reais.
import type { jsPDF as JsPdf } from 'jspdf';
import type autoTableFn from 'jspdf-autotable';
import {
  STORE_SIGNATURE,
  displayCode,
  formatBRL,
  formatDate,
  isServiceLine,
  manufacturerSummary,
  quoteTotals,
  PAYMENT_TO_COMBINE,
  validUntil,
  type QuoteLine,
  type QuoteMessageOptions,
} from './quote-message';

type DocWithTable = JsPdf & { lastAutoTable?: { finalY: number } };

export type QuotePdfOptions = QuoteMessageOptions & { customerPhone?: string };

// Azul-marinho da identidade Vardão e o laranja de ação (docs/IDENTIDADE_VISUAL_VARDAO.md).
export const NAVY: [number, number, number] = [39, 58, 96];
export const NAVY_DARK: [number, number, number] = [31, 39, 66];
const GOLD: [number, number, number] = [255, 200, 0];
export const INK: [number, number, number] = [30, 30, 29];
export const MUTED: [number, number, number] = [104, 104, 103];
export const ZEBRA: [number, number, number] = [244, 245, 248];
export const RULE: [number, number, number] = [212, 216, 226];

export const MARGIN = 40;

/** Faixa azul da loja com o dourado embaixo; o documento (orçamento, ficha) e a data entram à direita. */
export function drawStoreHeader(doc: JsPdf, title: string, dateText: string): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 92, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 92, pageWidth, 4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text('VARDÃO MÁQUINAS', MARGIN, 46);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Revenda Autorizada Ouro Husqvarna', MARGIN, 66);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, pageWidth - MARGIN, 44, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(dateText, pageWidth - MARGIN, 64, { align: 'right' });
}

/** (11) 98765-4321 a partir de só dígitos; o que não casa volta como veio. */
export function formatPhoneBr(raw: string | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return raw ?? '';
}

export function buildQuotePdf(input: {
  doc: JsPdf;
  autoTable: typeof autoTableFn;
  items: QuoteLine[];
  options: QuotePdfOptions;
  now?: Date;
}): JsPdf {
  const { doc, autoTable, items, options } = input;
  const now = input.now ?? new Date();
  const totals = quoteTotals(items, options.discountPercentage);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  drawStoreHeader(doc, 'ORÇAMENTO', formatDate(now));

  // ── Dados do atendimento ─────────────────────────────────────────────────────────────────────────
  const models = [...new Set(items.filter(item => !isServiceLine(item)).map(item => item.model).filter(Boolean))];
  const machine = options.machineModel || (models.length === 1 ? models[0] : models.length > 1 ? models.join(' / ') : '');
  const brands = [...new Set(items.filter(item => !isServiceLine(item)).map(item => item.manufacturer).filter((v): v is string => Boolean(v)))];
  const machineLabel = machine ? `${brands.length === 1 ? `${brands[0]} ` : ''}${machine}` : '';

  const facts: Array<[string, string]> = [];
  if (options.customerName) facts.push(['Cliente', options.customerName]);
  if (options.customerPhone) facts.push(['Telefone', formatPhoneBr(options.customerPhone)]);
  if (machineLabel) facts.push(['Máquina', machineLabel]);
  facts.push(['Válido até', validUntil(now)]);

  let y = 126;
  doc.setTextColor(...INK);
  const colWidth = (pageWidth - MARGIN * 2) / 2;
  facts.forEach(([label, value], index) => {
    const x = MARGIN + (index % 2) * colWidth;
    if (index > 0 && index % 2 === 0) y += 30;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(value, colWidth - 16)[0] as string, x, y + 14);
  });
  y += 42;

  // ── Tabela de peças ──────────────────────────────────────────────────────────────────────────────
  const body = items.map((item, index) => {
    let description = item.name;
    if (item.isSuperseded && item.originalCode) description += `\nSubstitui o código ${displayCode(item, item.originalCode)}`;
    if (item.model && models.length > 1 && !isServiceLine(item)) description += `\nMáquina: ${item.model}`;
    const priced = (item.unitPrice ?? 0) > 0;
    return [
      String(index + 1),
      isServiceLine(item) ? '' : displayCode(item),
      description,
      String(item.quantity),
      priced ? formatBRL(item.unitPrice as number) : 'Sob consulta',
      priced ? formatBRL(item.quantity * (item.unitPrice as number)) : 'Sob consulta',
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Código', 'Descrição', 'Qtd', 'Valor unit.', 'Subtotal']],
    body,
    theme: 'plain',
    margin: { left: MARGIN, right: MARGIN, bottom: 70 },
    headStyles: { fillColor: NAVY_DARK, textColor: 255, fontStyle: 'bold', fontSize: 9, cellPadding: { top: 7, bottom: 7, left: 6, right: 6 } },
    styles: { fontSize: 10, cellPadding: { top: 7, bottom: 7, left: 6, right: 6 }, textColor: INK, lineColor: RULE, lineWidth: 0 },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: {
      0: { cellWidth: 26, halign: 'center', textColor: MUTED },
      // Código em Courier negrito: é o que o cliente confere na peça e o que ele lê para outra pessoa.
      1: { cellWidth: 92, font: 'courier', fontStyle: 'bold', fontSize: 10.5 },
      3: { cellWidth: 34, halign: 'center' },
      4: { cellWidth: 74, halign: 'right' },
      5: { cellWidth: 78, halign: 'right', fontStyle: 'bold' },
    },
    didDrawCell: data => {
      if (data.section !== 'body') return;
      // linha fina entre as peças
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.5);
      doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
    },
  });

  // ── Totais ───────────────────────────────────────────────────────────────────────────────────────
  let after = ((doc as DocWithTable).lastAutoTable?.finalY ?? y) + 22;
  const boxWidth = 230;
  const boxX = pageWidth - MARGIN - boxWidth;
  const needed = totals.hasAnyPrice ? 110 : 30;
  if (after + needed > pageHeight - 80) {
    doc.addPage();
    after = 60;
  }

  if (totals.hasAnyPrice && totals.gross > 0) {
    doc.setTextColor(...INK);
    if (totals.discount > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.text('Subtotal', boxX, after);
      doc.text(formatBRL(totals.gross), boxX + boxWidth, after, { align: 'right' });
      doc.text(`Desconto (${options.discountPercentage}%)`, boxX, after + 17);
      doc.text(`-${formatBRL(totals.discount)}`, boxX + boxWidth, after + 17, { align: 'right' });
      after += 36;
    }
    doc.setFillColor(...NAVY);
    doc.roundedRect(boxX, after - 6, boxWidth, 40, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL', boxX + 12, after + 19);
    doc.setFontSize(17);
    doc.text(formatBRL(totals.net), boxX + boxWidth - 12, after + 20, { align: 'right' });
    after += 62;
  }

  const hasPayment = Boolean(options.paymentMethod && options.paymentMethod !== PAYMENT_TO_COMBINE);
  if (hasPayment) {
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Pagamento', MARGIN, after);
    doc.setFont('helvetica', 'normal');
    doc.text(options.paymentMethod as string, MARGIN + 62, after);
  }

  // ── Rodapé em toda página ────────────────────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, pageHeight - 54, pageWidth - MARGIN, pageHeight - 54);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(STORE_SIGNATURE, MARGIN, pageHeight - 38);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(`${manufacturerSummary(items)} · Válido até ${validUntil(now)}`, MARGIN, pageHeight - 25);
    doc.text(`Página ${page} de ${pages}`, pageWidth - MARGIN, pageHeight - 25, { align: 'right' });
  }

  return doc;
}
