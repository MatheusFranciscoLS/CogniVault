// O PDF que o CLIENTE recebe, no formato do orçamento com timbre da loja (modelo em Word do dono, 2026-10-07):
// logo e dados da loja no alto, "Cidade, data", A/C, Ref., tabela, condições (pagamento, validade, transportadora,
// observações), "ATT." e os dados da loja no rodapé.
//
// Mesmos valores do texto do WhatsApp (lib/quote-message.ts): mesmo arredondamento do servidor, mesma validade.
// **Nada interno do balcão e NENHUM código de peça**: o cliente poderia cotar o mesmo código em outra revenda.
//
// `jsPDF` e `autoTable` chegam por parâmetro porque são carregados sob demanda (a biblioteca pesa e só o
// orçamento usa); assim este arquivo não entra no pacote principal e dá para testar com os módulos reais.
import type { jsPDF as JsPdf } from 'jspdf';
import type autoTableFn from 'jspdf-autotable';
import type { PdfImage } from './pdf-assets';
import { QUOTE_DEFAULTS, STORE_CITY, STORE_PROFILE } from './store-profile';
import {
  STORE_SIGNATURE,
  formatBRL,
  isServiceLine,
  quoteTotals,
  PAYMENT_TO_COMBINE,
  validUntil,
  type QuoteLine,
  type QuoteMessageOptions,
} from './quote-message';

type DocWithTable = JsPdf & { lastAutoTable?: { finalY: number } };

export type QuotePdfOptions = QuoteMessageOptions & {
  customerPhone?: string;
  /** Quem atendeu: sai como "ATT. Nome". Sem nome, a linha some. */
  attendantName?: string;
  /** "Ref.:" (assunto). */
  reference?: string;
  shipping?: string;
  observations?: readonly string[];
  validityDays?: number;
};

// Azul-marinho da identidade Vardão e o dourado do selo (docs/IDENTIDADE_VISUAL_VARDAO.md).
export const NAVY: [number, number, number] = [39, 58, 96];
export const NAVY_DARK: [number, number, number] = [31, 39, 66];
const GOLD: [number, number, number] = [255, 200, 0];
export const INK: [number, number, number] = [30, 30, 29];
export const MUTED: [number, number, number] = [104, 104, 103];
export const ZEBRA: [number, number, number] = [244, 245, 248];
export const RULE: [number, number, number] = [212, 216, 226];

export const MARGIN = 40;
/** Folga que as tabelas deixam embaixo para o rodapé do timbre. */
export const FOOTER_SPACE = 92;

/** (11) 98765-4321 a partir de só dígitos; o que não casa volta como veio. */
export function formatPhoneBr(raw: string | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return raw ?? '';
}

/** "Limeira, 07 de outubro de 2026" */
export function cityAndDate(now: Date): string {
  const long = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(now);
  return `${STORE_CITY}, ${long}`;
}

/**
 * Timbre do alto da página: a logo à esquerda e os dados da loja à direita, como no modelo. Sem a logo
 * (não carregou), o nome da loja em texto ocupa o lugar. Devolve o `y` onde o conteúdo pode começar.
 */
export function drawLetterhead(doc: JsPdf, input: { logo?: PdfImage | null; title: string }): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const top = 34;

  if (input.logo) {
    const width = 150;
    const height = (width * input.logo.height) / input.logo.width;
    doc.addImage(input.logo.dataUrl, 'PNG', MARGIN, top, width, height);
    // A logo do site é só "VARDÃO"; o timbre da loja traz "MÁQUINAS E JARDINAGEM" embaixo.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...NAVY);
    doc.text('MÁQUINAS E JARDINAGEM', MARGIN + 1, top + height + 13, { charSpace: 1.6 });
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(...NAVY);
    doc.text('VARDÃO', MARGIN, top + 22);
    doc.setFontSize(9);
    doc.text('MÁQUINAS E JARDINAGEM', MARGIN, top + 36);
  }

  const p = STORE_PROFILE;
  const lines: Array<{ text: string; bold?: boolean }> = [
    { text: p.legalName, bold: true },
    { text: `CNPJ ${p.cnpj} · IE ${p.stateRegistration}` },
    { text: `${p.street} · ${p.neighborhood}` },
    { text: `${p.city} - ${p.state} · CEP ${p.zip}` },
    { text: p.phones.join(' / ') },
  ];
  lines.forEach((line, index) => {
    doc.setFont('helvetica', line.bold ? 'bold' : 'normal');
    doc.setFontSize(line.bold ? 9.5 : 8.5);
    doc.setTextColor(...(line.bold ? INK : MUTED));
    doc.text(line.text, pageWidth - MARGIN, top + 8 + index * 11.5, { align: 'right' });
  });

  // Filete azul com um trecho dourado: é o selo da loja, no lugar da faixa cheia de antes.
  const ruleY = top + 70;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, ruleY, pageWidth - MARGIN, ruleY);
  doc.setFillColor(...GOLD);
  doc.rect(MARGIN, ruleY - 1, 64, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...NAVY);
  doc.text(input.title, MARGIN, ruleY + 34);
  return ruleY + 52;
}

/** Rodapé do timbre em toda página: dados da loja ao centro e a numeração à direita. */
export function drawLetterFooter(doc: JsPdf, extra?: string): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const p = STORE_PROFILE;
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, pageHeight - 70, pageWidth - MARGIN, pageHeight - 70);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...NAVY);
    doc.text(`${p.legalName} - ${p.city.toUpperCase()}-${p.state}`, pageWidth / 2, pageHeight - 56, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(`${p.street}, ${p.neighborhood}, CEP ${p.zip}, ${p.city} - ${p.stateName} · Telefone: ${p.phones[0]}`, pageWidth / 2, pageHeight - 45, { align: 'center' });
    doc.text(`E-mail: ${p.email}${extra ? ` · ${extra}` : ''}`, pageWidth / 2, pageHeight - 34, { align: 'center' });
    doc.setFontSize(8);
    doc.text(`Página ${page} de ${pages}`, pageWidth - MARGIN, pageHeight - 20, { align: 'right' });
  }
}

export function buildQuotePdf(input: {
  doc: JsPdf;
  autoTable: typeof autoTableFn;
  items: QuoteLine[];
  options: QuotePdfOptions;
  logo?: PdfImage | null;
  now?: Date;
}): JsPdf {
  const { doc, autoTable, items, options } = input;
  const now = input.now ?? new Date();
  const totals = quoteTotals(items, options.discountPercentage);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const validityDays = options.validityDays ?? QUOTE_DEFAULTS.validityDays;
  // O prazo é digitado à mão em cada orçamento (depende do estoque); vazio volta ao padrão do modelo.
  const leadTime = options.leadTime?.trim() || QUOTE_DEFAULTS.leadTime;

  let y = drawLetterhead(doc, { logo: input.logo, title: 'ORÇAMENTO' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...MUTED);
  doc.text(cityAndDate(now), pageWidth - MARGIN, y - 22, { align: 'right' });

  // ── Para quem é ──────────────────────────────────────────────────────────────────────────────────
  const models = [...new Set(items.filter(item => !isServiceLine(item)).map(item => item.model).filter(Boolean))];
  const machine = options.machineModel || (models.length === 1 ? models[0] : models.length > 1 ? models.join(' / ') : '');
  const brands = [...new Set(items.filter(item => !isServiceLine(item)).map(item => item.manufacturer).filter((v): v is string => Boolean(v)))];
  const machineLabel = machine ? `${brands.length === 1 ? `${brands[0]} ` : ''}${machine}` : '';

  const facts: Array<[string, string]> = [];
  if (options.customerName) facts.push(['A/C:', options.customerName]);
  if (options.customerPhone) facts.push(['Telefone:', formatPhoneBr(options.customerPhone)]);
  facts.push(['Ref.:', options.reference || QUOTE_DEFAULTS.reference]);
  if (machineLabel) facts.push(['Máquina:', machineLabel]);

  doc.setTextColor(...INK);
  for (const [label, value] of facts) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(label, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(value, pageWidth - MARGIN * 2 - 62)[0] as string, MARGIN + 62, y);
    y += 16;
  }
  y += 8;

  // ── Tabela de peças (SEM código) ─────────────────────────────────────────────────────────────────
  const body = items.map((item, index) => {
    let description = item.name;
    if (item.model && models.length > 1 && !isServiceLine(item)) description += `\nMáquina: ${item.model}`;
    const priced = (item.unitPrice ?? 0) > 0;
    return [
      String(index + 1),
      description,
      leadTime,
      String(item.quantity),
      priced ? formatBRL(item.unitPrice as number) : 'Sob consulta',
      priced ? formatBRL(item.quantity * (item.unitPrice as number)) : 'Sob consulta',
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['#', 'DESCRIÇÃO', 'PRAZO', 'QTD', 'VALOR UNIT.', 'VALOR TOTAL']],
    body,
    theme: 'plain',
    margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_SPACE },
    headStyles: { fillColor: NAVY_DARK, textColor: 255, fontStyle: 'bold', fontSize: 8.5, cellPadding: { top: 7, bottom: 7, left: 6, right: 6 } },
    styles: { fontSize: 10, cellPadding: { top: 7, bottom: 7, left: 6, right: 6 }, textColor: INK, lineColor: RULE, lineWidth: 0 },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: {
      0: { cellWidth: 24, halign: 'center', textColor: MUTED },
      2: { cellWidth: 62, halign: 'center', fontSize: 9 },
      3: { cellWidth: 32, halign: 'center' },
      4: { cellWidth: 76, halign: 'right' },
      5: { cellWidth: 82, halign: 'right', fontStyle: 'bold' },
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
  if (after + needed > pageHeight - FOOTER_SPACE) {
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

  // ── Condições, como no modelo da loja ────────────────────────────────────────────────────────────
  const payment = options.paymentMethod && options.paymentMethod !== PAYMENT_TO_COMBINE ? options.paymentMethod : QUOTE_DEFAULTS.paymentTerms;
  // Observações digitadas no orçamento (uma por linha) substituem as padrão da loja.
  const typedNotes = (options.notes ?? '').split('\n').map(line => line.replace(/^[\s•–-]+/, '').trim()).filter(Boolean);
  const observations = options.observations ?? (typedNotes.length ? typedNotes : QUOTE_DEFAULTS.observations);
  const conditions: string[][] = [
    ['Condição de Pagamento:', payment],
    ['Validade do Orçamento:', `${validityDays} dias (até ${validUntil(now, validityDays)})`],
    ['Transportadora:', options.shipping ?? QUOTE_DEFAULTS.shipping],
  ];
  if (observations.length) conditions.push(['Observação:', observations.map(line => `• ${line}`).join('\n')]);

  autoTable(doc, {
    startY: Math.min(after, pageHeight - FOOTER_SPACE - 20),
    body: conditions,
    theme: 'plain',
    margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_SPACE },
    styles: { fontSize: 10, cellPadding: { top: 3, bottom: 3, left: 0, right: 6 }, textColor: INK },
    columnStyles: { 0: { cellWidth: 126, fontStyle: 'bold' } },
  });

  // ── Assinatura ───────────────────────────────────────────────────────────────────────────────────
  let sign = ((doc as DocWithTable).lastAutoTable?.finalY ?? after) + 26;
  if (options.attendantName) {
    if (sign + 44 > pageHeight - FOOTER_SPACE) {
      doc.addPage();
      sign = 60;
    }
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.text('ATT.', MARGIN, sign);
    doc.setFont('helvetica', 'bold');
    doc.text(options.attendantName, MARGIN, sign + 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(STORE_SIGNATURE, MARGIN, sign + 29);
  }

  drawLetterFooter(doc);
  return doc;
}
