import { describe, expect, it } from 'vitest';
import { PAYMENT_30_DAYS, PAYMENT_CASH, customerPayment, paymentChoice } from './payment-terms';

describe('condição de pagamento', () => {
  it('o botão marcado pelo texto guardado, inclusive o de orçamento antigo', () => {
    expect(paymentChoice('')).toBe('NONE');
    expect(paymentChoice(undefined)).toBe('NONE');
    expect(paymentChoice('A Combinar no Balcão')).toBe('NONE');
    expect(paymentChoice('a combinar')).toBe('NONE');
    expect(paymentChoice(PAYMENT_CASH)).toBe('CASH');
    expect(paymentChoice('À Vista / PIX (5% desc.)')).toBe('CASH');
    expect(paymentChoice('a vista')).toBe('CASH');
    expect(paymentChoice(PAYMENT_30_DAYS)).toBe('DAYS30');
    expect(paymentChoice('30 dias')).toBe('DAYS30');
    expect(paymentChoice('Cartão de Débito')).toBe('OTHER');
    expect(paymentChoice('Boleto 14/28 dias')).toBe('OTHER');
    expect(paymentChoice('50% na entrada e 50% em 15 dias')).toBe('OTHER');
  });

  it('o que o cliente lê: sem PIX e sem desconto, "a combinar" não é escrito pela mensagem', () => {
    expect(customerPayment(PAYMENT_CASH)).toBe('À vista');
    expect(customerPayment('À Vista / PIX (5% desc.)')).toBe('À vista');
    expect(customerPayment(PAYMENT_30_DAYS)).toBe('A prazo 30 dias');
    expect(customerPayment('30 dias')).toBe('A prazo 30 dias');
    expect(customerPayment('')).toBeNull();
    expect(customerPayment('A Combinar no Balcão')).toBeNull();
    expect(customerPayment('  Cartão   de crédito em 3x ')).toBe('Cartão de crédito em 3x');
  });

  it('nada que o cliente lê fala de PIX nem de desconto de 5% vindo da condição', () => {
    for (const antigo of ['À Vista / PIX (5% desc.)', 'a vista / pix']) expect(customerPayment(antigo)).not.toMatch(/pix|5%/i);
  });

  it('texto livre é cortado em 120 caracteres', () => {
    expect(customerPayment('x'.repeat(300))?.length).toBe(120);
  });
});
