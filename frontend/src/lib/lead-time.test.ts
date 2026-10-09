import { describe, expect, it } from 'vitest';
import { LEAD_TIME_NOW, LEAD_TIME_ORDER, leadMode, leadTimeConflict, leadTimeFor, leadTimeNote, notesMention } from './lead-time';

describe('prazo das peças', () => {
  it('reconhece a opção pelo texto guardado', () => {
    expect(leadMode('')).toBe('NONE');
    expect(leadMode('   ')).toBe('NONE');
    expect(leadMode(undefined)).toBe('NONE');
    expect(leadMode(null)).toBe('NONE');
    expect(leadMode('Imediato')).toBe('NOW');
    expect(leadMode(' IMEDIATO ')).toBe('NOW');
    expect(leadMode('Pronta entrega')).toBe('NOW');
    expect(leadMode(' pronta  entrega ')).toBe('NOW');
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

  it('pronta entrega é o texto novo e orçamento antigo com "Imediato" continua sendo pronta entrega', () => {
    expect(LEAD_TIME_NOW).toBe('Pronta entrega');
    expect(leadMode('Imediato')).toBe('NOW');
    expect(leadTimeFor('NONE', 'Pronta entrega')).toBe('');
    expect(leadTimeFor('ORDER', 'Pronta entrega')).toBe(LEAD_TIME_ORDER);
  });

  it('a linha das observações acompanha o prazo escolhido', () => {
    expect(leadTimeNote('Pronta entrega')).toBe('Peça em pronta entrega');
    expect(leadTimeNote('Imediato')).toBe('Peça em pronta entrega');
    expect(leadTimeNote('7 a 10 dias')).toBe('Peça sob encomenda');
    expect(leadTimeNote('')).toBeNull();
    expect(leadTimeNote(undefined)).toBeNull();
  });

  it('o que as observações já dizem da entrega', () => {
    expect(notesMention('Peça sob encomenda')).toBe('ORDER');
    expect(notesMention('Encomenda com sinal de 50%')).toBe('ORDER');
    expect(notesMention('Peça em pronta-entrega')).toBe('NOW');
    expect(notesMention('Pronta entrega')).toBe('NOW');
    expect(notesMention('Impostos inclusos\nEstoque rotativo sujeito a venda diária')).toBe('NONE');
    expect(notesMention('')).toBe('NONE');
    expect(notesMention(undefined)).toBe('NONE');
  });

  it('avisa quando o prazo escolhido e as observações se contradizem (o caso que o dono achou)', () => {
    expect(leadTimeConflict('Pronta entrega', 'Frete por conta do cliente\nPeça sob encomenda')).toMatch(/encomenda.*pronta entrega/);
    expect(leadTimeConflict('Imediato', 'Peça sob encomenda')).not.toBeNull();
    expect(leadTimeConflict('7 a 10 dias', 'Peça em pronta entrega')).toMatch(/pronta entrega.*encomenda/);
    expect(leadTimeConflict('Pronta entrega', 'Peça em pronta entrega')).toBeNull();
    expect(leadTimeConflict('7 a 10 dias', 'Peça sob encomenda')).toBeNull();
    expect(leadTimeConflict('', 'Peça sob encomenda')).toBeNull();
    expect(leadTimeConflict('Pronta entrega', 'Impostos inclusos')).toBeNull();
  });
});
