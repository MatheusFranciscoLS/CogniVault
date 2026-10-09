// O que o CLIENTE recebe do orçamento: texto do WhatsApp e valores do PDF.
//
// Funções puras (sem React, sem rede), para o texto poder ser testado sem abrir a tela.
// Regra de redação: o cliente quer saber O QUE está levando, QUANTO custa, ATÉ QUANDO vale e
// QUEM mandou. Posição na vista explodida, seção do catálogo e PNC são informação interna do
// balcão e não entram na mensagem.
import { formatHusqvarnaPartNumber } from '../lib';
import { QUOTE_DEFAULTS } from './store-profile';

export type QuoteLine = {
  partNumber: string;
  effectiveCode?: string;
  manufacturer?: string | null;
  name: string;
  model: string;
  pnc?: string | null;
  isSuperseded?: boolean;
  originalCode?: string;
  /** Prazo desta linha ("Pronta entrega", "7 dias"); vazio = vale o do orçamento. */
  leadTime?: string;
  quantity: number;
  unitPrice?: number;
};

export type QuoteMessageOptions = {
  customerName?: string;
  machineModel?: string;
  /** Motor da máquina ("Kawasaki FX921V-ES06"). Modelo do motor, nunca código de peça. */
  engine?: string;
  paymentMethod?: string;
  /** Prazo das peças, digitado à mão. */
  leadTime?: string;
  /** Observações digitadas no orçamento (substituem as padrão da loja no PDF). */
  notes?: string;
  discountPercentage?: number;
  /** Tipo do orçamento: peças (padrão) ou conserto (peças de qualquer fornecedor e mão de obra). */
  kind?: 'PARTS' | 'REPAIR';
  /** Número digitado pelo balcão (no conserto, o da OS do Clipp). */
  docNumber?: string;
};

/** Marca da loja nos textos para o cliente. Sem "Revenda Autorizada Ouro": o cliente não conhece nem precisa dessa distinção (dono, 2026-10-07). */
export const STORE_SIGNATURE = 'Vardão Máquinas';

export const PAYMENT_TO_COMBINE = 'A Combinar no Balcão';

/** "R$ 4.093,48": com separador de milhar (antes saía "R$ 4093,48"). */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value).split(String.fromCharCode(160)).join(' ');
}

/** Soma `days` dias CORRIDOS a partir de `from`. */
export function addDays(from: Date, days: number): Date {
  const result = new Date(from);
  result.setDate(result.getDate() + days);
  return result;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

/** Validade do orçamento: 20 dias corridos, como no modelo da loja (`QUOTE_DEFAULTS.validityDays`). */
export function validUntil(now: Date, days: number = QUOTE_DEFAULTS.validityDays): string {
  return formatDate(addDays(now, days));
}

export function isServiceLine(line: Pick<QuoteLine, 'partNumber'>): boolean {
  return line.partNumber.toUpperCase().startsWith('SRV-');
}

export function displayCode(line: QuoteLine, code = line.effectiveCode || line.partNumber): string {
  return line.manufacturer?.toLowerCase().includes('husqvarna') ? formatHusqvarnaPartNumber(code) : code;
}

export function manufacturerSummary(lines: QuoteLine[]): string {
  const manufacturers = [...new Set(lines.map(line => line.manufacturer).filter((value): value is string => Boolean(value)))];
  if (manufacturers.length === 1) return `Peças originais ${manufacturers[0]}`;
  if (manufacturers.length > 1) return 'Peças originais de fabricantes diversos';
  return 'Peças originais';
}

/** Mesmo arredondamento do servidor (`roundMoney` em quote.service.ts): o cliente tem que ver o MESMO total que fica arquivado. */
export function roundMoney(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export function quoteTotals(lines: QuoteLine[], discountPercentage = 0) {
  const gross = roundMoney(lines.reduce((sum, line) => sum + line.quantity * (line.unitPrice || 0), 0));
  // O desconto é arredondado ANTES de subtrair, como no servidor: 484,35 com 10% dá desconto 48,44 e total 435,91
  // (arredondar só o total dava 435,92, um centavo a mais do que o orçamento arquivado).
  const discount = gross > 0 && discountPercentage > 0 ? roundMoney((gross * discountPercentage) / 100) : 0;
  return { gross, discount, net: roundMoney(gross - discount), hasAnyPrice: lines.some(line => (line.unitPrice || 0) > 0) };
}

export function buildWhatsAppMessage(input: { items: QuoteLine[]; options: QuoteMessageOptions; now?: Date }): string {
  const { items, options } = input;
  if (!items.length) return '';
  const now = input.now ?? new Date();
  const totals = quoteTotals(items, options.discountPercentage);

  // Serviço avulso (SRV-) não é máquina: com ele na conta, um orçamento de uma máquina só parecia ter duas.
  const models = [...new Set(items.filter(item => !isServiceLine(item)).map(item => item.model).filter(Boolean))];
  const several = models.length > 1;
  const machine = options.machineModel || (models.length === 1 ? models[0] : '');
  const manufacturers = [...new Set(items.filter(item => !isServiceLine(item)).map(item => item.manufacturer).filter((value): value is string => Boolean(value)))];
  const brand = manufacturers.length === 1 ? `${manufacturers[0]} ` : '';

  const out: string[] = [];
  const repair = options.kind === 'REPAIR';
  out.push(repair ? '*Orçamento de conserto · Vardão Máquinas*' : '*Orçamento · Vardão Máquinas*');
  if (repair && options.docNumber?.trim()) out.push(`OS: ${options.docNumber.trim()}`);
  if (options.customerName) out.push(`Cliente: *${options.customerName}*`);
  if (machine) out.push(`Máquina: ${brand}${machine}`);
  if (options.engine) out.push(`Motor: ${options.engine}`);
  out.push(`Data: ${formatDate(now)}`);
  out.push('', repair ? '*Peças e serviços*' : '*Peças*');

  items.forEach((item, index) => {
    const quantity = item.quantity > 1 ? ` — ${item.quantity}x` : '';
    out.push('', `${index + 1}. *${item.name}*${quantity}`);
    if (item.unitPrice && item.unitPrice > 0) {
      out.push(item.quantity > 1
        ? `   ${item.quantity} × ${formatBRL(item.unitPrice)} = ${formatBRL(item.quantity * item.unitPrice)}`
        : `   ${formatBRL(item.unitPrice)}`);
    } else if (totals.hasAnyPrice) {
      out.push('   Valor a consultar');
    }
    if (several && item.model && !isServiceLine(item)) out.push(`   Máquina: ${item.model}`);
    if (item.leadTime?.trim()) out.push(`   Prazo: ${item.leadTime.trim()}`);
  });

  if (totals.hasAnyPrice && totals.gross > 0) {
    out.push('');
    if (totals.discount > 0) {
      out.push(`Subtotal: ${formatBRL(totals.gross)}`);
      out.push(`Desconto (${options.discountPercentage}%): -${formatBRL(totals.discount)}`);
    }
    out.push(`*Total: ${formatBRL(totals.net)}*`);
  }

  out.push('');
  if (options.paymentMethod && options.paymentMethod !== PAYMENT_TO_COMBINE) out.push(`Pagamento: ${options.paymentMethod}`);
  // O prazo das peças depende do estoque e é digitado à mão; sem ele, a mensagem não promete prazo nenhum.
  if (options.leadTime?.trim()) out.push(`Prazo das peças: ${options.leadTime.trim()}`);
  if (options.notes?.trim()) out.push(`Observação: ${options.notes.trim().split('\n').map(line => line.trim()).filter(Boolean).join(' · ')}`);
  out.push(`Válido até ${validUntil(now)}`);
  // No conserto as peças são de qualquer fornecedor: "Peças originais Husqvarna" no fim seria falso.
  out.push('', STORE_SIGNATURE);
  if (!repair) out.push(manufacturerSummary(items));

  return out.join('\n');
}
