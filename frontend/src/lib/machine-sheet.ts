// Ficha da máquina para o CLIENTE (texto do WhatsApp e PDF), a partir da Tabela de preços.
//
// Mesmo critério do orçamento: só o que o cliente lê e confere, nada interno do balcão (PNC, ordem, selos de
// novidade). O preço é o da lista, sem a divisão por 0,92 das peças, e vem com a data da tabela para não passar
// por preço de hoje um valor de lista antiga.
import type { jsPDF as JsPdf } from 'jspdf';
import type autoTableFn from 'jspdf-autotable';
import { applicationLabel, categoryLabel, technologyLabel, type ListedMachine } from './machine-list';
import { INK, MARGIN, MUTED, NAVY, NAVY_DARK, RULE, ZEBRA, drawStoreHeader } from './quote-pdf';
import { STORE_SIGNATURE, formatBRL, formatDate } from './quote-message';

export type SheetEquipmentItem = { name: string; value: string | null };
export type SheetEquipment = { included: SheetEquipmentItem[]; notIncluded: SheetEquipmentItem[] } | null;

type DocWithTable = JsPdf & { lastAutoTable?: { finalY: number } };

const equipmentLine = (item: SheetEquipmentItem): string => (item.value ? `${item.name}: ${item.value}` : item.name);

/** "Roçadeira · Combustão · Profissional" */
export function machineFacts(machine: ListedMachine): string {
  return [categoryLabel(machine.category), technologyLabel(machine.technology), applicationLabel(machine.application)]
    .filter(Boolean)
    .join(' · ');
}

export function buildMachineSheetMessage(input: {
  machine: ListedMachine;
  equipment: SheetEquipment;
  listDate: Date | null;
}): string {
  const { machine, equipment, listDate } = input;
  const out: string[] = [];
  out.push(`*${machine.model}* · Husqvarna`);
  if (machine.description && machine.description !== machine.model) out.push(machine.description);
  out.push(machineFacts(machine));
  out.push('', `*Preço: ${formatBRL(machine.listPrice)}*`);
  if (listDate) out.push(`Valor da tabela de ${formatDate(listDate)}`);

  if (machine.specs.length > 0) {
    out.push('', '*Ficha técnica*');
    for (const spec of machine.specs) out.push(`• ${spec.label}: ${spec.value}`);
  }
  if (equipment?.included.length) {
    out.push('', '*Acompanha*');
    for (const item of equipment.included) out.push(`• ${equipmentLine(item)}`);
  }
  if (equipment?.notIncluded.length) {
    out.push('', '*Não acompanha*');
    for (const item of equipment.notIncluded) out.push(`• ${equipmentLine(item)}`);
  }

  out.push('', STORE_SIGNATURE);
  return out.join('\n');
}

export function machineSheetFileName(machine: Pick<ListedMachine, 'model'>): string {
  const slug = machine.model.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `Ficha-${slug || 'maquina'}.pdf`;
}

export function buildMachineSheetPdf(input: {
  doc: JsPdf;
  autoTable: typeof autoTableFn;
  machine: ListedMachine;
  equipment: SheetEquipment;
  listDate: Date | null;
}): JsPdf {
  const { doc, autoTable, machine, equipment, listDate } = input;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  drawStoreHeader(doc, 'FICHA DA MÁQUINA', formatDate(new Date()));

  // Título: modelo grande, descrição e categoria logo abaixo.
  let y = 130;
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text(doc.splitTextToSize(`Husqvarna ${machine.model}`, pageWidth - MARGIN * 2)[0] as string, MARGIN, y);
  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  if (machine.description && machine.description !== machine.model) {
    doc.text(doc.splitTextToSize(machine.description, pageWidth - MARGIN * 2)[0] as string, MARGIN, y);
    y += 15;
  }
  doc.text(machineFacts(machine), MARGIN, y);

  // Preço em destaque, à direita.
  doc.setFillColor(...NAVY);
  doc.roundedRect(pageWidth - MARGIN - 190, 108, 190, 54, 4, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('PREÇO', pageWidth - MARGIN - 178, 126);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text(formatBRL(machine.listPrice), pageWidth - MARGIN - 12, 150, { align: 'right' });
  y += 30;

  const tableStyles = {
    theme: 'plain' as const,
    margin: { left: MARGIN, right: MARGIN, bottom: 70 },
    headStyles: { fillColor: NAVY_DARK, textColor: 255, fontStyle: 'bold' as const, fontSize: 9, cellPadding: { top: 6, bottom: 6, left: 6, right: 6 } },
    styles: { fontSize: 10, cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }, textColor: INK },
    alternateRowStyles: { fillColor: ZEBRA },
  };

  if (machine.specs.length > 0) {
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [['Ficha técnica', '']],
      body: machine.specs.map(spec => [spec.label, spec.value]),
      columnStyles: { 0: { cellWidth: 150, textColor: MUTED }, 1: { fontStyle: 'bold' } },
    });
    y = ((doc as DocWithTable).lastAutoTable?.finalY ?? y) + 22;
  }

  const lists: Array<[string, SheetEquipmentItem[]]> = [
    ['Acompanha', equipment?.included ?? []],
    ['Não acompanha', equipment?.notIncluded ?? []],
  ];
  for (const [title, items] of lists) {
    if (!items.length) continue;
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [[title]],
      body: items.map(item => [equipmentLine(item)]),
    });
    y = ((doc as DocWithTable).lastAutoTable?.finalY ?? y) + 22;
  }

  // Rodapé em toda página.
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
    doc.text(listDate ? `Valor da tabela de ${formatDate(listDate)}` : 'Valor da tabela vigente', MARGIN, pageHeight - 25);
    doc.text(`Página ${page} de ${pages}`, pageWidth - MARGIN, pageHeight - 25, { align: 'right' });
  }

  return doc;
}
