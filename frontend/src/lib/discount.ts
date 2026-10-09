// Desconto do orçamento (dono, 2026-10-09): "5% PIX" é o único atalho (a loja não chega a 10 nem a 15%); qualquer outro desconto é digitado
// ("7" ou "7,5") e o sistema já calcula o valor. O servidor aceita de 0 a 100 com duas casas (`parseQuoteOptions`).

/** Percentual que o atalho "PIX" aplica. */
export const PIX_DISCOUNT = 5;

/**
 * O que o atendente digitou no campo de desconto, como percentual: "7", "7,5", "7.5", " 7 % " → 7 / 7,5.
 * Vazio vale 0 (sem desconto). Texto que não é número, negativo, acima de 100 ou com mais de duas casas devolve `null`
 * (a tela marca o campo e não muda o desconto).
 */
export function parseDiscountInput(text: string): number | null {
  const clean = text.replace('%', '').trim().replace(',', '.');
  if (clean === '') return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(clean)) return null;
  const value = Number(clean);
  return value >= 0 && value <= 100 ? value : null;
}

/** Como o percentual aparece no campo: "7" ou "7,5" (vírgula, como o balcão escreve). */
export function formatDiscountInput(percentage: number): string {
  return String(percentage).replace('.', ',');
}
