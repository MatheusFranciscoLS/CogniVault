// Condição de pagamento do orçamento (dono, 2026-10-09): só "À vista" ou "A prazo 30 dias", ou um campo para escrever outra. Sem escolha, o orçamento sai
// "A combinar". **Sem "PIX 5% de desconto"**: se o cliente não pedir, a loja não dá desconto (margem). O texto fica guardado como a loja escreve
// (`Quote.paymentMethod` é texto livre), então não há coluna nova nem lista fechada.

export const PAYMENT_CASH = 'À vista';
export const PAYMENT_30_DAYS = 'A prazo 30 dias';
/** Valor antigo de "ainda não escolhido": o PDF diz "A combinar" e a mensagem do WhatsApp não fala de pagamento. */
export const PAYMENT_TO_COMBINE = 'A Combinar no Balcão';

export type PaymentChoice = 'NONE' | 'CASH' | 'DAYS30' | 'OTHER';

const norm = (text: string) => text.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Qual botão está marcado para o texto guardado. Orçamento antigo ("À Vista / PIX (5% desc.)", "Cartão de Débito") continua abrindo certo. */
export function paymentChoice(value: string | null | undefined): PaymentChoice {
  const text = (value ?? '').trim();
  if (!text || norm(text) === norm(PAYMENT_TO_COMBINE) || norm(text) === 'a combinar') return 'NONE';
  if (/^a vista(\s*\/\s*pix.*)?$/.test(norm(text))) return 'CASH';
  if (norm(text) === norm(PAYMENT_30_DAYS) || /^(a prazo )?30 dias$/.test(norm(text))) return 'DAYS30';
  return 'OTHER';
}

/**
 * O que o CLIENTE lê (PDF e WhatsApp). Vazio ou "a combinar" devolve `null` (o PDF escreve "A combinar" e a mensagem não fala de pagamento).
 * "À Vista / PIX (5% desc.)" de orçamento antigo sai como "À vista": o desconto de 5% não existe mais.
 */
export function customerPayment(value: string | null | undefined): string | null {
  switch (paymentChoice(value)) {
    case 'NONE': return null;
    case 'CASH': return PAYMENT_CASH;
    case 'DAYS30': return PAYMENT_30_DAYS;
    default: return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
  }
}
