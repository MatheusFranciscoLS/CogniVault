// O que o CLIENTE recebe do orçamento: texto do WhatsApp e valores do PDF.
//
// Funções puras (sem React, sem rede), para o texto poder ser testado sem abrir a tela.
// Regra de redação: o cliente quer saber O QUE está levando, QUANTO custa, ATÉ QUANDO vale e
// QUEM mandou. Posição na vista explodida, seção do catálogo e PNC são informação interna do
// balcão e não entram na mensagem.
import { formatHusqvarnaPartNumber } from '../lib';

export type QuoteLine = {
  partNumber: string;
  effectiveCode?: string;
  manufacturer?: string | null;
  name: string;
  model: string;
  pnc?: string | null;
  isSuperseded?: boolean;
  originalCode?: string;
  quantity: number;
  unitPrice?: number;
};

export type QuoteMessageOptions = {
  customerName?: string;
  machineModel?: string;
  paymentMethod?: string;
  discountPercentage?: number;
};

/** Marca da loja nos textos para o cliente. É a mesma do login: "Revenda Autorizada Ouro". */
export const STORE_SIGNATURE = 'Vardão Máquinas · Revenda Autorizada Ouro Husqvarna';

export const PAYMENT_TO_COMBINE = 'A Combinar no Balcão';

/** "R$ 4.093,48": com separador de milhar (antes saía "R$ 4093,48"). */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value).split(String.fromCharCode(160)).join(' ');
}

/** Soma `days` dias ÚTEIS (segunda a sexta; feriado não entra) a partir de `from`. */
export function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const weekday = result.getDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return result;
}

export const QUOTE_VALIDITY_BUSINESS_DAYS = 7;

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

export function validUntil(now: Date): string {
  return formatDate(addBusinessDays(now, QUOTE_VALIDITY_BUSINESS_DAYS));
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

export function quoteTotals(lines: QuoteLine[], discountPercentage = 0) {
  const gross = lines.reduce((sum, line) => sum + line.quantity * (line.unitPrice || 0), 0);
  const discount = gross > 0 && discountPercentage > 0 ? (gross * discountPercentage) / 100 : 0;
  return { gross, discount, net: gross - discount, hasAnyPrice: lines.some(line => (line.unitPrice || 0) > 0) };
}

export function buildWhatsAppMessage(input: { items: QuoteLine[]; options: QuoteMessageOptions; now?: Date }): string {
  const { items, options } = input;
  if (!items.length) return '';
  const now = input.now ?? new Date();
  const totals = quoteTotals(items, options.discountPercentage);

  const models = [...new Set(items.map(item => item.model).filter(Boolean))];
  const several = models.length > 1;
  const machine = options.machineModel || (models.length === 1 ? models[0] : '');
  const manufacturers = [...new Set(items.map(item => item.manufacturer).filter((value): value is string => Boolean(value)))];
  const brand = manufacturers.length === 1 ? `${manufacturers[0]} ` : '';

  const out: string[] = [];
  out.push('*Orçamento · Vardão Máquinas*');
  if (options.customerName) out.push(`Cliente: *${options.customerName}*`);
  if (machine) out.push(`Máquina: ${brand}${machine}`);
  out.push(`Data: ${formatDate(now)}`);
  out.push('', '*Peças*');

  items.forEach((item, index) => {
    const quantity = item.quantity > 1 ? ` — ${item.quantity}x` : '';
    out.push('', `${index + 1}. *${item.name}*${quantity}`);
    if (!isServiceLine(item)) out.push(`   Código: \`${displayCode(item)}\``);
    if (item.unitPrice && item.unitPrice > 0) {
      out.push(item.quantity > 1
        ? `   ${item.quantity} × ${formatBRL(item.unitPrice)} = ${formatBRL(item.quantity * item.unitPrice)}`
        : `   ${formatBRL(item.unitPrice)}`);
    } else if (totals.hasAnyPrice) {
      out.push('   Valor a consultar');
    }
    if (item.isSuperseded && item.originalCode) out.push(`   Substitui o código \`${displayCode(item, item.originalCode)}\``);
    if (several && item.model && !isServiceLine(item)) out.push(`   Máquina: ${item.model}`);
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
  out.push(`Válido até ${validUntil(now)}`);
  out.push('', STORE_SIGNATURE, manufacturerSummary(items));

  return out.join('\n');
}
