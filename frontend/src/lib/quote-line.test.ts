import { describe, expect, it } from 'vitest';
import { LEAD_TIME_NOW, LEAD_TIME_ORDER } from './lead-time';
import { leadChoiceOf, leadTextFor } from './quote-line';

describe('prazo da linha do orçamento', () => {
  it('qual opção do seletor vale para o texto guardado', () => {
    expect(leadChoiceOf('')).toBe('');
    expect(leadChoiceOf(undefined)).toBe('');
    expect(leadChoiceOf('   ')).toBe('');
    expect(leadChoiceOf('Pronta entrega')).toBe('NOW');
    expect(leadChoiceOf('Imediato')).toBe('NOW');
    expect(leadChoiceOf('7 a 10 dias')).toBe('ORDER');
    expect(leadChoiceOf('10 dias')).toBe('ORDER');
  });

  it('o texto que passa a valer: pronta entrega, ou a encomenda (a que o orçamento já tem, senão a padrão)', () => {
    expect(leadTextFor('NOW')).toBe(LEAD_TIME_NOW);
    expect(leadTextFor('ORDER')).toBe(LEAD_TIME_ORDER);
    expect(leadTextFor('ORDER', 'Pronta entrega')).toBe(LEAD_TIME_ORDER);
    expect(leadTextFor('ORDER', ' 12 dias ')).toBe('12 dias');
  });
});
