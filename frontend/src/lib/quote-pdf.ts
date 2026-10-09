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
import { effectiveLeadNote, notesMention } from './lead-time';
import { customerPayment } from './payment-terms';
import { makePdfSafe } from './pdf-text';
import { QUOTE_DEFAULTS, STORE_CITY, STORE_PROFILE } from './store-profile';
import {
  formatBRL,
  isServiceLine,
  quoteTotals,
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
  /** "Empresa:" (orçamento para empresa: o A/C é a pessoa, aqui vai a razão social). */
  company?: string;
  /** "Nº:" do orçamento, digitado; sem número, a linha some. */
  quoteNumber?: string;
  /** Informações do cliente, uma por linha: "Pedido: 4500123", "Frota: 12", "Contato: (19) 99999-0000". Linha sem rótulo sai como "Obs.:". */
  customerNotes?: string;
};

const MAX_CUSTOMER_NOTE_LINES = 5;

/**
 * As linhas livres que o atendente escreve (pedido de compra, frota, contato...) viram linhas do cabeçalho do PDF. "Rótulo: valor" separa
 * o rótulo (em negrito); linha sem rótulo vira "Obs.:". Vazias são ignoradas e passar de 5 linhas corta o resto.
 */
export function customerNoteRows(text: string | undefined): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.trim().slice(0, 140);
    if (!line) continue;
    const match = /^([^:]{1,30}):\s*(.+)$/.exec(line);
    rows.push(match ? [`${match[1].trim()}:`, match[2].trim()] : ['Obs.:', line]);
    if (rows.length >= MAX_CUSTOMER_NOTE_LINES) break;
  }
  return rows;
}

// Azul-marinho da identidade Vardão e o dourado do selo (docs/IDENTIDADE_VISUAL_VARDAO.md).
export const NAVY: [number, number, number] = [39, 58, 96];
export const NAVY_DARK: [number, number, number] = [31, 39, 66];
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

  // Um filete azul só (o trecho dourado que havia aqui era enfeite e o dono achou sem sentido, 2026-10-07).
  const ruleY = top + 70;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, ruleY, pageWidth - MARGIN, ruleY);

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
  makePdfSafe(doc);
  const now = input.now ?? new Date();
  const totals = quoteTotals(items, options.discountPercentage);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const validityDays = options.validityDays ?? QUOTE_DEFAULTS.validityDays;
  // O prazo é ESCOLHIDO em cada orçamento (Imediato, Encomenda ou nenhum). Sem prazo, o PDF não tem a coluna: orçamento
  // expresso, só nome, quantidade e valor (dono, 2026-10-07).
  const leadTime = options.leadTime?.trim() ?? '';
  const showLead = leadTime !== '' || items.some(item => (item.leadTime ?? '').trim() !== '');

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
  const repair = options.kind === 'REPAIR';
  if (options.quoteNumber?.trim()) facts.push([repair ? 'OS:' : 'Nº:', options.quoteNumber.trim()]);
  if (options.customerName) facts.push(['A/C:', options.customerName]);
  if (options.company?.trim()) facts.push(['Empresa:', options.company.trim()]);
  if (options.customerPhone) facts.push(['Telefone:', formatPhoneBr(options.customerPhone)]);
  facts.push(['Ref.:', options.reference || (repair ? QUOTE_DEFAULTS.repairReference : QUOTE_DEFAULTS.reference)]);
  facts.push(...customerNoteRows(options.customerNotes));
  if (machineLabel) facts.push(['Máquina:', machineLabel]);
  if (options.engine) facts.push(['Motor:', options.engine]);

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  // A coluna dos valores acompanha o rótulo mais largo (um "Pedido de compra:" digitado não pode invadir o valor).
  const valueX = MARGIN + Math.max(62, ...facts.map(([label]) => doc.getTextWidth(label) + 8));
  for (const [label, value] of facts) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(label, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(value, pageWidth - MARGIN - valueX)[0] as string, valueX, y);
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
      // Prazo da própria linha primeiro; sem ele, só PEÇA leva o prazo do orçamento (mão de obra fica em branco).
      ...(showLead ? [item.leadTime?.trim() || (isServiceLine(item) ? '' : leadTime)] : []),
      String(item.quantity),
      priced ? formatBRL(item.unitPrice as number) : 'Sob consulta',
      priced ? formatBRL(item.quantity * (item.unitPrice as number)) : 'Sob consulta',
    ];
  });

  const columns: Record<number, { cellWidth: number; halign: 'center' | 'right'; textColor?: [number, number, number]; fontSize?: number; fontStyle?: 'bold' }> = showLead
      ? {
          0: { cellWidth: 24, halign: 'center', textColor: MUTED },
          2: { cellWidth: 76, halign: 'center', fontSize: 9 },
          3: { cellWidth: 32, halign: 'center' },
          4: { cellWidth: 76, halign: 'right' },
          5: { cellWidth: 82, halign: 'right', fontStyle: 'bold' },
        }
      : {
          0: { cellWidth: 24, halign: 'center', textColor: MUTED },
          2: { cellWidth: 40, halign: 'center' },
          3: { cellWidth: 90, halign: 'right' },
          4: { cellWidth: 100, halign: 'right', fontStyle: 'bold' },
        };

  autoTable(doc, {
    startY: y,
    head: [['#', 'DESCRIÇÃO', ...(showLead ? ['PRAZO'] : []), 'QTD', 'VALOR UNIT.', 'VALOR TOTAL']],
    body,
    theme: 'plain',
    margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_SPACE },
    headStyles: { fillColor: NAVY_DARK, textColor: 255, fontStyle: 'bold', fontSize: 8.5, cellPadding: { top: 7, bottom: 7, left: 6, right: 6 } },
    styles: { fontSize: 10, cellPadding: { top: 7, bottom: 7, left: 6, right: 6 }, textColor: INK, lineColor: RULE, lineWidth: 0 },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: columns,
    // O título da coluna segue o alinhamento dos valores dela (QTD no centro, valores à direita).
    didParseCell: data => {
      const align = columns[data.column.index]?.halign;
      if (data.section === 'head' && align) data.cell.styles.halign = align;
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
  const payment = customerPayment(options.paymentMethod) ?? QUOTE_DEFAULTS.paymentTerms;
  // Observações digitadas no orçamento (uma por linha) substituem as padrão da loja.
  const typedNotes = (options.notes ?? '').split('\n').map(line => line.replace(/^[\s•–-]+/, '').trim()).filter(Boolean);
  // A primeira linha acompanha o prazo escolhido ("Peça em pronta entrega" ou "Peça sob encomenda"), para a observação nunca contradizer a
  // coluna PRAZO (dono, 2026-10-09). Se o que foi digitado já fala da entrega, não se repete a linha.
  const deliveryNote = effectiveLeadNote(items, options.leadTime);
  const baseNotes = typedNotes.length ? typedNotes : QUOTE_DEFAULTS.observations;
  const observations = options.observations ?? (deliveryNote && notesMention(baseNotes.join(' ')) === 'NONE' ? [deliveryNote, ...baseNotes] : baseNotes);
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
  }

  drawLetterFooter(doc);
  return doc;
}
