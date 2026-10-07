// Orçamento de MÁQUINA para o cliente, no modelo em Word da loja (pasta "Modelo Timbre", 2026-10-07): uma única linha
// "01-) <tipo>, modelo X equipado com motor ..., potência ..., tanque ..., largura de corte ...", o destaque
// "recomendado para ...", e então Preço, Condição de Pagamento, Prazo de Entrega, Validade, Observação e "ATT.".
//
// A descrição técnica sai da ficha da Tabela de preços; o que a lista não traz (transmissão, câmbios, velocidade)
// o atendente acrescenta no campo "Complemento". O PREÇO vem da lista como sugestão e é editável: no modelo da loja
// o valor negociado quase nunca é o da lista (Z460: lista R$ 79.999, orçamento R$ 79.900).
//
// **Nada interno do balcão**: nem PNC, nem código de peça (regra do dono). `jsPDF`/`autoTable` chegam por
// parâmetro, como em `quote-pdf.ts`.
import type { jsPDF as JsPdf } from 'jspdf';
import type autoTableFn from 'jspdf-autotable';
import { categoryLabel, type ListedMachine } from './machine-list';
import type { PdfImage } from './pdf-assets';
import { FOOTER_SPACE, INK, MARGIN, MUTED, NAVY, cityAndDate, drawLetterFooter, drawLetterhead } from './quote-pdf';
import { STORE_SIGNATURE, formatBRL, validUntil } from './quote-message';
import { QUOTE_DEFAULTS } from './store-profile';
import type { SheetEquipment } from './machine-sheet';

type DocWithTable = JsPdf & { lastAutoTable?: { finalY: number } };

export const MACHINE_QUOTE_DEFAULTS = {
  payment: 'A combinar',
  leadTime: 'Imediato',
  observation: QUOTE_DEFAULTS.observations[0],
  validityDays: QUOTE_DEFAULTS.validityDays,
} as const;

export type MachineQuoteFields = {
  customerName: string;
  /** Preço do orçamento (não o da lista). */
  price: number;
  payment: string;
  leadTime: string;
  observation: string;
  /** Frase livre acrescentada à descrição ("com transmissão Hidrostática, 2 câmbios..."). */
  complement: string;
  /** Linha de destaque entre asteriscos; vazia some. */
  highlight: string;
  /** Lista "Conjunto composto por" com o que acompanha, vinda do Portal. */
  includeEquipment: boolean;
};

const normalizeCategory = (category: string) => category.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/** Como a loja escreve o assunto e a primeira linha, por categoria (conforme os orçamentos em Word). */
export function machineTypeNames(machine: Pick<ListedMachine, 'category'>): { reference: string; item: string } {
  switch (normalizeCategory(machine.category)) {
    case 'GIRO ZERO': return { reference: 'Trator Giro Zero', item: 'Giro Zero Cortador de Grama' };
    case 'TRATOR': return { reference: 'Trator', item: 'Trator Cortador de Grama' };
    case 'RIDER': return { reference: 'Trator Rider', item: 'Rider Cortador de Grama' };
    default: {
      const name = categoryLabel(machine.category);
      return { reference: name, item: name };
    }
  }
}

export function machineQuoteReference(machine: Pick<ListedMachine, 'category' | 'model'>): string {
  return `Orçamento ${machineTypeNames(machine).reference} Husqvarna ${machine.model}`;
}

/** "Recomendado para ..." conforme a aplicação da lista; o atendente edita ou apaga. */
export function defaultHighlight(application: ListedMachine['application']): string {
  if (application === 'PROFISSIONAL') return 'Recomendado para trabalhos profissionais e intensivos';
  if (application === 'COMERCIAL') return 'Recomendado para uso comercial';
  return '';
}

function spec(machine: Pick<ListedMachine, 'specs'>, label: string): string | null {
  const wanted = label.toLowerCase();
  return machine.specs.find(item => item.label.toLowerCase() === wanted)?.value?.trim() || null;
}

/** "17,9 kW (24 hp)" / "31 hp / 23.1 kw" -> "17,9 KW/ 24 HP". Sem os dois números, devolve como veio. */
export function formatPower(raw: string | null): string | null {
  if (!raw) return null;
  const kw = /([\d.,]+)\s*kw/i.exec(raw)?.[1];
  const hp = /([\d.,]+)\s*hp/i.exec(raw)?.[1];
  const comma = (value: string) => value.replace('.', ',');
  if (kw && hp) return `${comma(kw)} KW/ ${comma(hp)} HP`;
  if (hp) return `${comma(hp)} HP`;
  if (kw) return `${comma(kw)} KW`;
  return raw;
}

/** "2 tempos" / "4 tempos" quando a ficha diz; riders, tratores e giro zero são sempre 4 tempos. */
export function engineStroke(machine: Pick<ListedMachine, 'specs' | 'category'>): string | null {
  const text = `${spec(machine, 'Motor') ?? ''} ${spec(machine, 'Combustível') ?? ''}`;
  const found = /\b([24])\s*(?:tempos|t)\b/i.exec(text)?.[1];
  if (found) return `${found} tempos`;
  return ['GIRO ZERO', 'TRATOR', 'RIDER'].includes(normalizeCategory(machine.category)) ? '4 tempos' : null;
}

function liters(raw: string | null): string | null {
  if (!raw) return null;
  const match = /([\d.,]+)\s*(ml|l)\b/i.exec(raw);
  if (!match) return raw;
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value)) return raw;
  const inLiters = match[2].toLowerCase() === 'ml' ? value / 1000 : value;
  return `${String(inLiters).replace('.', ',')} litros`;
}

function centimeters(raw: string | null): string | null {
  if (!raw) return null;
  // "103cm / 112cm" fica como está; só normaliza o simples.
  return /^\s*[\d.,]+\s*cm\s*$/i.test(raw) ? raw.replace(/\s*cm\s*$/i, '').trim() + ' cm' : raw;
}

/** A frase do item "01-)", só com o que a ficha traz. */
export function machineQuoteDescription(machine: ListedMachine, complement = ''): string {
  const { item } = machineTypeNames(machine);
  const stroke = engineStroke(machine);
  const displacement = spec(machine, 'Cilindrada');
  const power = formatPower(spec(machine, 'Potência'));
  const weight = spec(machine, 'Peso');
  const tank = liters(spec(machine, 'Tanque'));
  const width = centimeters(spec(machine, 'Largura de trabalho'));

  const engine = [stroke, displacement && `de ${displacement}`].filter(Boolean).join(' ');
  const parts = [
    engine && `equipado com motor ${engine}`,
    power && `potência de ${power}`,
    weight && `peso de ${weight}`,
    tank && `tanque de combustível com capacidade de ${tank}`,
    width && `largura de corte de ${width}`,
  ].filter((part): part is string => Boolean(part));

  let text = `${item}, modelo ${machine.model}${parts.length ? ` ${parts.join(', ')}` : ''}`;
  const extra = complement.trim().replace(/[.\s]+$/, '');
  if (extra) text += `, ${extra}`;
  return `${text}.`;
}

/** "R$ 79.900,00", "79900", "79.900" -> 79900. Texto sem número -> null. */
export function parseMoneyInput(input: string): number | null {
  const cleaned = input.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : (/^\d{1,3}(\.\d{3})+$/.test(cleaned) ? cleaned.replace(/\./g, '') : cleaned);
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

export function machineQuoteFileName(machine: Pick<ListedMachine, 'model'>): string {
  const slug = machine.model.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `Orcamento-${slug || 'maquina'}.pdf`;
}

export function buildMachineQuotePdf(input: {
  doc: JsPdf;
  autoTable: typeof autoTableFn;
  machine: ListedMachine;
  equipment: SheetEquipment;
  fields: MachineQuoteFields;
  attendantName?: string;
  logo?: PdfImage | null;
  /** Foto da máquina (opcional): entra entre a descrição e o preço, como no modelo em Word. */
  photo?: PdfImage | null;
  now?: Date;
}): JsPdf {
  const { doc, autoTable, machine, equipment, fields } = input;
  const now = input.now ?? new Date();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const textWidth = pageWidth - MARGIN * 2;

  let y = drawLetterhead(doc, { logo: input.logo, title: 'ORÇAMENTO' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...MUTED);
  doc.text(cityAndDate(now), pageWidth - MARGIN, y - 22, { align: 'right' });

  doc.setTextColor(...INK);
  const fact = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(label, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(value, textWidth - 62)[0] as string, MARGIN + 62, y);
    y += 16;
  };
  if (fields.customerName.trim()) fact('A/C:', fields.customerName.trim());
  fact('Ref.:', machineQuoteReference(machine));
  y += 10;

  // Descrição, como a primeira linha do modelo em Word.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(`01-) ${machineQuoteDescription(machine, fields.complement)}`, textWidth) as string[];
  doc.text(lines, MARGIN, y, { lineHeightFactor: 1.35 });
  y += lines.length * 15 + 8;

  const included = fields.includeEquipment ? (equipment?.included ?? []) : [];
  if (included.length) {
    doc.setFont('helvetica', 'normal');
    doc.text(`Conjunto da ${machineTypeNames(machine).reference.toLowerCase()} é composto por:`, MARGIN, y);
    y += 16;
    for (const itemLine of included.slice(0, 14)) {
      const text = itemLine.value ? `${itemLine.name}: ${itemLine.value}` : itemLine.name;
      const wrapped = doc.splitTextToSize(`•  ${text}`, textWidth - 12) as string[];
      doc.text(wrapped, MARGIN + 12, y);
      y += wrapped.length * 14;
    }
    y += 6;
  }

  if (input.photo) {
    // Até 190 pt de altura e 300 de largura, centralizada, sem esticar.
    const ratio = input.photo.width / input.photo.height;
    const height = Math.min(190, 300 / ratio);
    const width = height * ratio;
    if (y + height + 200 > pageHeight - FOOTER_SPACE) {
      doc.addPage();
      y = 60;
    }
    doc.addImage(input.photo.dataUrl, 'JPEG', (pageWidth - width) / 2, y, width, height);
    y += height + 14;
  }

  if (fields.highlight.trim()) {
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...NAVY);
    doc.text(`******  ${fields.highlight.trim()}  ******`, pageWidth / 2, y, { align: 'center' });
    doc.setTextColor(...INK);
    y += 26;
  }

  // Preço em destaque e as condições, como no modelo.
  if (y + 190 > pageHeight - FOOTER_SPACE) {
    doc.addPage();
    y = 60;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`Preço: ${formatBRL(fields.price)}`, MARGIN, y);
  y += 12;

  const validityDays = MACHINE_QUOTE_DEFAULTS.validityDays;
  const rows: string[][] = [
    ['Condição de Pagamento:', fields.payment.trim() || MACHINE_QUOTE_DEFAULTS.payment],
    ['Prazo de Entrega:', fields.leadTime.trim() || MACHINE_QUOTE_DEFAULTS.leadTime],
    ['Validade do Orçamento:', `${validityDays} dias (até ${validUntil(now, validityDays)})`],
  ];
  if (fields.observation.trim()) rows.push(['Observação:', fields.observation.trim()]);
  autoTable(doc, {
    startY: y,
    body: rows,
    theme: 'plain',
    margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_SPACE },
    styles: { fontSize: 10.5, cellPadding: { top: 3, bottom: 3, left: 0, right: 6 }, textColor: INK },
    columnStyles: { 0: { cellWidth: 134, fontStyle: 'bold' } },
  });

  let sign = ((doc as DocWithTable).lastAutoTable?.finalY ?? y) + 28;
  if (input.attendantName) {
    if (sign + 44 > pageHeight - FOOTER_SPACE) {
      doc.addPage();
      sign = 60;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text('ATT.', MARGIN, sign);
    doc.setFont('helvetica', 'bold');
    doc.text(input.attendantName, MARGIN, sign + 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(STORE_SIGNATURE, MARGIN, sign + 29);
  }

  drawLetterFooter(doc);
  return doc;
}
