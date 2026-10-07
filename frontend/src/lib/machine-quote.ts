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

/**
 * "Conjunto composto por" entra sozinho só na roçadeira (cabeçote, cinto, lâmina), como no modelo em Word. Nas outras
 * máquinas o Portal lista ATRIBUTOS em inglês ("Spikes: Mounted"), que não são itens que o cliente leva.
 */
export function defaultIncludeEquipment(machine: Pick<ListedMachine, 'category'>, equipment: SheetEquipment): boolean {
  const count = equipment?.included.length ?? 0;
  return normalizeCategory(machine.category).startsWith('ROCADEIRA') && count > 0 && count <= 8;
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

/** "3.5 kg" -> "3,5 kg". Só com 1 ou 2 casas depois do ponto: "7.890" pode ser milhar e fica como veio. */
export const decimalComma = (text: string | null): string | null => (text ? text.replace(/(\d)\.(\d{1,2})(?!\d)/g, '$1,$2') : text);

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** Só vale como tensão o que parece tensão: a lista traz "Relação de transmissão 13:1" nesse campo em alguma máquina. */
function voltage(machine: Pick<ListedMachine, 'specs'>): string | null {
  const value = spec(machine, 'Tensão');
  return value && /\d\s*V\b/i.test(value) ? value : null;
}

const modelKey = (model: string) => model.replace(/[^a-z0-9]/gi, '').toUpperCase();

/**
 * Um mesmo modelo aparece na lista em versões (motosserra 272XP com sabre de 13, 15, 18 e 20 polegadas, a 4.149 e 4.299).
 * Nesse caso o orçamento precisa dizer QUAL: devolve a descrição da lista ("Motosserra mod272xp 13"pd 3/8""). Modelo
 * único não leva nota.
 */
export function machineVariantNote(machine: Pick<ListedMachine, 'model' | 'description' | 'category'>, all: ReadonlyArray<Pick<ListedMachine, 'model'>>): string | null {
  const siblings = all.filter(item => modelKey(item.model) === modelKey(machine.model)).length;
  if (siblings < 2) return null;
  // Da descrição da lista ("MOTOSSERRA MOD272XP 15"PD 3/8"") fica só o que distingue a versão ("15"PD 3/8""):
  // sai a categoria, o modelo e o "MOD" que a Husqvarna cola nele.
  const category = modelKey(machine.category);
  const model = modelKey(machine.model);
  const rest = machine.description
    .split(/\s+/)
    .filter(token => {
      const key = modelKey(token);
      return key && key !== category && key !== model && key !== `MOD${model}` && key !== 'MOD' && key !== 'HUSQ';
    })
    .join(' ');
  return rest || null;
}

/** A frase do item "01-)", só com o que a ficha traz. */
export function machineQuoteDescription(machine: ListedMachine, complement = '', variant: string | null = null): string {
  const { item } = machineTypeNames(machine);
  const battery = /BATERIA/.test(normalizeCategory(machine.technology ?? ''));
  const stroke = engineStroke(machine);
  const displacement = spec(machine, 'Cilindrada');
  const power = formatPower(spec(machine, 'Potência'));
  const weight = decimalComma(spec(machine, 'Peso'));
  const tank = liters(spec(machine, 'Tanque'));
  const width = decimalComma(centimeters(spec(machine, 'Largura de trabalho')));
  const volts = voltage(machine);

  // Máquina a bateria não tem cilindrada nem tempos: descreve o motor elétrico e a tensão.
  const motor = spec(machine, 'Motor');
  const engine = battery
    ? (motor && /^el[eé]tric/i.test(motor) ? lowerFirst(motor) : '')
    : [stroke, displacement && `de ${displacement}`].filter(Boolean).join(' ');
  const parts = [
    engine && `equipado com motor ${engine}`,
    battery && volts && `alimentado por bateria de ${volts}`,
    !battery && normalizeCategory(machine.category) === 'GERADOR' && volts && `tensão de ${volts}`,
    spec(machine, 'Área de trabalho') && `área de trabalho de até ${spec(machine, 'Área de trabalho')}`,
    spec(machine, 'Inclinação máxima') && `inclinação máxima de ${spec(machine, 'Inclinação máxima')}`,
    power && `potência de ${power}`,
    weight && `peso de ${weight}`,
    tank && `tanque de combustível com capacidade de ${tank}`,
    width && (normalizeCategory(machine.category) === 'MOTOSSERRA' ? `comprimento do sabre de ${width}` : `largura de corte de ${width}`),
  ].filter((part): part is string => Boolean(part));

  // Com motor a frase segue "equipado com motor..."; sem motor (robô, bateria sem motor na ficha) vira lista com vírgulas.
  const joined = parts.join(', ');
  const separator = parts[0]?.startsWith('equipado') ? ' ' : ', ';
  let text = `${item}, modelo ${machine.model}${variant ? ` (${variant})` : ''}${parts.length ? `${separator}${joined}` : ''}`;
  const extra = complement.trim().replace(/[.\s]+$/, '');
  if (extra) text += `, ${extra}`;
  return `${text}.`;
}

export type PortalFeature = { name: string };
export type PortalSpecification = { group: string; name: string; value: string };

/**
 * O que o atendente digitava à mão ("com transmissão Hidrostática, 2 câmbios, velocidade máxima...") agora é uma
 * SUGESTÃO tirada do Portal da própria máquina: transmissão, posições de altura e velocidade máxima à frente. Só para
 * cortador, trator, rider e giro zero, onde o modelo em Word da loja traz isso. Qualquer coisa que o Portal não diga
 * fica de fora; o atendente edita ou apaga.
 */
export function suggestComplement(
  machine: Pick<ListedMachine, 'category' | 'specs'>,
  portal: { features?: PortalFeature[]; specifications?: PortalSpecification[] } | null | undefined,
): string {
  if (!['GIRO ZERO', 'TRATOR', 'RIDER', 'CORTADOR DE GRAMA'].includes(normalizeCategory(machine.category))) return '';
  const features = portal?.features ?? [];
  const pieces: string[] = [];

  // A ficha da lista vem primeiro (é a da máquina exata); o Portal completa o que a lista não traz.
  const listedTransmission = spec(machine, 'Transmissão');
  const transmission = features.find(feature => /^transmiss/i.test(feature.name.trim()));
  if (listedTransmission) pieces.push(`com transmissão ${listedTransmission.replace(/\s+/g, ' ')}`);
  else if (transmission) pieces.push(`com ${lowerFirst(transmission.name.trim())}`);

  const height = features
    .map(feature => /altura[^\d]*(\d{1,2})\s*posi/i.exec(feature.name) ?? /(\d{1,2})\s*posi[^\d]*altura/i.exec(feature.name))
    .find(Boolean);
  if (height) pieces.push(`${height[1]} posições para regulagem da altura de corte`);

  const speed = (portal?.specifications ?? []).find(item => /velocidade\s+à\s+frente.*max$/i.test(item.name.trim()));
  const listedSpeed = /([1-9]\d*(?:[.,]\d+)?)\s*km\/h/i.exec(spec(machine, 'Velocidade máxima') ?? '')?.[1];
  const speedValue = listedSpeed ?? (speed && /([1-9]\d*(?:[.,]\d+)?)\s*km\/h/i.exec(speed.value)?.[1]);
  if (speedValue) pieces.push(`velocidade máxima de ${speedValue.replace('.', ',')} km/h`);

  if (pieces.length <= 1) return pieces[0] ?? '';
  return `${pieces.slice(0, -1).join(', ')} e ${pieces[pieces.length - 1]}`;
}

/** Hoje, no formato do campo de data (`aaaa-mm-dd`), pela data LOCAL do balcão (não a UTC do servidor). */
export function todayInputValue(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** `aaaa-mm-dd` -> data ao meio-dia local (sem virar o dia anterior por fuso). Texto inválido -> null. */
export function parseInputDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null;
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
  /** Versão do modelo quando há mais de uma na lista (`machineVariantNote`). */
  variant?: string | null;
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
  const lines = doc.splitTextToSize(`01-) ${machineQuoteDescription(machine, fields.complement, input.variant)}`, textWidth) as string[];
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
