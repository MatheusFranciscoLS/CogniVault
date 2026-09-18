import { normalizeIdentifier } from './normalize';

/**
 * O código da peça é o único campo do catálogo em que errar custa dinheiro no
 * balcão: o atendente vende, o cliente leva a peça errada e volta.
 *
 * Quando o PDF cai na leitura visual, o código vem de um modelo de linguagem.
 * O prompt manda preservar o número exatamente como está no catálogo, mas
 * prompt é pedido, não garantia — e o erro clássico da extração visual é ler a
 * coluna KEY/REF (posição) ou a quantidade como se fosse o código.
 *
 * Esta regra é **a mesma** que `catalog-health.ts` já usava para contar
 * `malformedPartNumberCount`. O que mudou não foi o critério, foi o momento:
 * antes ela só reduzia a nota de saúde *depois* de a peça já estar gravada e
 * pesquisável; agora ela também barra a gravação.
 *
 * Deliberadamente permissiva com formato de marca. O catálogo tem peça
 * Husqvarna (`505 30 00-01`, 9 dígitos), Briggs & Stratton (5–6 dígitos, ex.:
 * `27911`, `794653`) e Kawasaki/Kohler. Exigir o padrão Husqvarna derrubaria
 * peça legítima de motor. O piso mira só no que nunca é código de peça:
 * posição (1–3 dígitos) e quantidade.
 */

export const MIN_PART_NUMBER_LENGTH = 4;
export const MAX_PART_NUMBER_LENGTH = 18;
export const MIN_PART_NUMBER_DIGITS = 3;

export function isPlausiblePartNumber(value: string | null | undefined): boolean {
  const code = normalizeIdentifier(value);
  if (!code) return false;
  if (code.length < MIN_PART_NUMBER_LENGTH || code.length > MAX_PART_NUMBER_LENGTH) return false;
  return code.replace(/\D/g, '').length >= MIN_PART_NUMBER_DIGITS;
}

/** Motivo legível, para o descarte nunca ser silencioso no log. */
export function describePartNumberRejection(value: string | null | undefined): string {
  const code = normalizeIdentifier(value);
  if (!code) return 'código vazio';
  if (code.length < MIN_PART_NUMBER_LENGTH) return `código curto demais (${code.length} caracteres) — provável posição ou quantidade lida como código`;
  if (code.length > MAX_PART_NUMBER_LENGTH) return `código longo demais (${code.length} caracteres)`;
  return `poucos dígitos (${code.replace(/\D/g, '').length}) para ser código de peça`;
}
