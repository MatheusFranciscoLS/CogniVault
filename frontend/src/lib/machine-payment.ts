// Condição de pagamento do orçamento de MÁQUINA (dono, 2026-10-10): três meios, e o cliente escolhe entre os que a loja oferece:
//   À vista · cartão em até 10x sem juros · boleto em até 6x sem juros.
// O boleto exige consulta e NÃO vale na primeira compra, por isso ele começa desmarcado (À vista e cartão já vêm marcados). O orçamento de peças e o de conserto
// seguem com `lib/payment-terms.ts` (À vista / 30 dias / outro): máquina tem condição própria. O que sai no PDF é um texto só, escrito como a loja escreve.

export const MACHINE_PAYMENT_CASH = 'À vista';
export const MACHINE_PAYMENT_CARD = 'Cartão em até 10x sem juros';
/** "Sujeito a análise" é para o CLIENTE ler: a loja consulta antes e não faz boleto na primeira compra. */
export const MACHINE_PAYMENT_BOLETO = 'Boleto em até 6x sem juros (sujeito a análise)';
export const MACHINE_PAYMENT_TO_COMBINE = 'A combinar';
export const MACHINE_PAYMENT_OTHER_MAX = 120;

export type MachinePaymentChoice = { cash: boolean; card: boolean; boleto: boolean; other: string };

/** O que já vem marcado ao abrir o diálogo. */
export const DEFAULT_MACHINE_PAYMENT: MachinePaymentChoice = { cash: true, card: true, boleto: false, other: '' };

/** Texto que vai ao PDF, na ordem fixa (à vista, cartão, boleto, o que foi escrito). Nada marcado e nada escrito: "A combinar". */
export function machinePaymentText(choice: MachinePaymentChoice): string {
  const other = choice.other.trim().replace(/\s+/g, ' ').slice(0, MACHINE_PAYMENT_OTHER_MAX);
  const parts = [
    choice.cash ? MACHINE_PAYMENT_CASH : '',
    choice.card ? MACHINE_PAYMENT_CARD : '',
    choice.boleto ? MACHINE_PAYMENT_BOLETO : '',
    other,
  ].filter(Boolean);
  return parts.length ? parts.join('; ') : MACHINE_PAYMENT_TO_COMBINE;
}
