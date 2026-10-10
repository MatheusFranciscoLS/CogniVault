import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MACHINE_PAYMENT, MACHINE_PAYMENT_BOLETO, MACHINE_PAYMENT_CARD, MACHINE_PAYMENT_CASH, MACHINE_PAYMENT_OTHER_MAX, MACHINE_PAYMENT_TO_COMBINE, machinePaymentText,
} from './machine-payment';

const nada = { cash: false, card: false, boleto: false, other: '' };

describe('condição de pagamento da máquina', () => {
  it('abre com À vista e cartão marcados e o boleto de fora (ele exige consulta)', () => {
    expect(DEFAULT_MACHINE_PAYMENT).toEqual({ cash: true, card: true, boleto: false, other: '' });
    expect(machinePaymentText(DEFAULT_MACHINE_PAYMENT)).toBe(`${MACHINE_PAYMENT_CASH}; ${MACHINE_PAYMENT_CARD}`);
  });

  it('cada meio sozinho e as combinações, sempre na mesma ordem', () => {
    expect(machinePaymentText({ ...nada, cash: true })).toBe('À vista');
    expect(machinePaymentText({ ...nada, card: true })).toBe('Cartão em até 10x sem juros');
    expect(machinePaymentText({ ...nada, boleto: true })).toBe('Boleto em até 6x sem juros (sujeito a análise)');
    expect(machinePaymentText({ cash: true, card: true, boleto: true, other: '' })).toBe(`${MACHINE_PAYMENT_CASH}; ${MACHINE_PAYMENT_CARD}; ${MACHINE_PAYMENT_BOLETO}`);
    expect(machinePaymentText({ ...nada, boleto: true, cash: true })).toBe(`${MACHINE_PAYMENT_CASH}; ${MACHINE_PAYMENT_BOLETO}`);
  });

  it('o boleto diz que é sujeito a análise (o cliente lê isso)', () => {
    expect(MACHINE_PAYMENT_BOLETO).toMatch(/sujeito a análise/);
  });

  it('nada marcado e nada escrito vira "A combinar"', () => {
    expect(machinePaymentText(nada)).toBe(MACHINE_PAYMENT_TO_COMBINE);
    expect(machinePaymentText({ ...nada, other: '   ' })).toBe(MACHINE_PAYMENT_TO_COMBINE);
  });

  it('o texto escrito (saída para "nenhum destes") entra depois dos meios, sem espaço sobrando, com teto', () => {
    expect(machinePaymentText({ ...nada, other: '  50% na entrada   e 50% em 15 dias ' })).toBe('50% na entrada e 50% em 15 dias');
    expect(machinePaymentText({ ...nada, cash: true, other: 'Consórcio' })).toBe('À vista; Consórcio');
    expect(machinePaymentText({ ...nada, other: 'x'.repeat(500) })).toHaveLength(MACHINE_PAYMENT_OTHER_MAX);
  });
});
