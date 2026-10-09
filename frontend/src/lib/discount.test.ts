import { describe, expect, it } from 'vitest';
import { formatDiscountInput, parseDiscountInput } from './discount';
import { quoteTotals } from './quote-message';

describe('desconto digitado', () => {
  it('aceita inteiro, vírgula, ponto, espaço e o sinal de %', () => {
    expect(parseDiscountInput('7')).toBe(7);
    expect(parseDiscountInput('7,5')).toBe(7.5);
    expect(parseDiscountInput('7.5')).toBe(7.5);
    expect(parseDiscountInput(' 7 % ')).toBe(7);
    expect(parseDiscountInput('0')).toBe(0);
    expect(parseDiscountInput('100')).toBe(100);
  });

  it('campo vazio é sem desconto', () => {
    expect(parseDiscountInput('')).toBe(0);
    expect(parseDiscountInput('   ')).toBe(0);
  });

  it('recusa o que não é desconto: letras, negativo, acima de 100, três casas, lixo', () => {
    for (const text of ['abc', '-5', '101', '1000', '7,555', '7,,5', '7 e 5', '--', 'NaN', 'Infinity', '1e2', '٣']) expect(parseDiscountInput(text), text).toBeNull();
  });

  it('o campo mostra o percentual com vírgula', () => {
    expect(formatDiscountInput(7)).toBe('7');
    expect(formatDiscountInput(7.5)).toBe('7,5');
  });

  it('7% sobre R$ 484,35 sai igual ao do servidor: desconto arredondado antes de subtrair', () => {
    const itens = [{ partNumber: 'X1', name: 'Peça', model: '', quantity: 1, unitPrice: 484.35 }];
    const totals = quoteTotals(itens, 7);
    expect(totals.discount).toBe(33.9);
    expect(totals.net).toBe(450.45);
  });
});
