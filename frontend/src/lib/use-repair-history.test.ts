import { describe, expect, it } from 'vitest';
import { cleanSuggestions } from './use-repair-history';

describe('sugestões do histórico do conserto', () => {
  it('aceita o formato do servidor', () => {
    const item = { name: 'Filtro gasolina', partNumber: null, count: 8, price: 15, leadTime: 'Pronta entrega', isService: false };
    expect(cleanSuggestions([item])).toEqual([item]);
    expect(cleanSuggestions([{ ...item, price: null }])).toHaveLength(1);
  });

  it('resposta fora do formato vira lista vazia ou perde só a linha ruim, nunca lança', () => {
    expect(cleanSuggestions(undefined)).toEqual([]);
    expect(cleanSuggestions(null)).toEqual([]);
    expect(cleanSuggestions('texto')).toEqual([]);
    expect(cleanSuggestions({})).toEqual([]);
    expect(cleanSuggestions([null, 7, 'x', [], { name: 42 }, { name: '  ', count: 1, price: 1 }, { name: 'A', count: 'x', price: 1 }, { name: 'A', count: 1, price: 'caro' }, { name: 'A', count: 1, price: NaN }])).toEqual([]);
    const bom = { name: 'Vela', partNumber: null, count: 3, price: 24, leadTime: null, isService: false };
    expect(cleanSuggestions([null, bom, { name: 1 }])).toEqual([bom]);
  });
});
