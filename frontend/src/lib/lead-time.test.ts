import { describe, expect, it } from 'vitest';
import { LEAD_TIME_NOW, LEAD_TIME_ORDER, leadMode, leadTimeFor } from './lead-time';

describe('prazo das peças', () => {
  it('reconhece a opção pelo texto guardado', () => {
    expect(leadMode('')).toBe('NONE');
    expect(leadMode('   ')).toBe('NONE');
    expect(leadMode(undefined)).toBe('NONE');
    expect(leadMode(null)).toBe('NONE');
    expect(leadMode('Imediato')).toBe('NOW');
    expect(leadMode(' IMEDIATO ')).toBe('NOW');
    expect(leadMode('7 a 10 dias')).toBe('ORDER');
    expect(leadMode('15 dias úteis')).toBe('ORDER');
  });

  it('trocar de opção grava o texto certo e Encomenda mantém o prazo já digitado', () => {
    expect(leadTimeFor('NONE', 'Imediato')).toBe('');
    expect(leadTimeFor('NOW', '')).toBe(LEAD_TIME_NOW);
    expect(leadTimeFor('ORDER', '')).toBe(LEAD_TIME_ORDER);
    expect(leadTimeFor('ORDER', 'Imediato')).toBe(LEAD_TIME_ORDER);
    expect(leadTimeFor('ORDER', ' 12 dias ')).toBe('12 dias');
  });
});
