import { describe, expect, it } from 'vitest';
import { cleanSuggestions, priceLooksOff, sameHistoryLine } from './use-repair-history';

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

describe('referência de valor da linha', () => {
  const ref = { price: 150, count: 12 };
  it('reconhece a mesma linha com as grafias do histórico', () => {
    expect(sameHistoryLine('Filtro de gasolina', 'FILTRO GASOLINA')).toBe(true);
    expect(sameHistoryLine('Mão de obra', 'MAO DE OBRA')).toBe(true);
    expect(sameHistoryLine('Óleo 20W50 (0,3)', 'oleo 20w50')).toBe(true);
    expect(sameHistoryLine('Filtro de ar', 'Filtro gasolina')).toBe(false);
    expect(sameHistoryLine('', '')).toBe(false);
    expect(sameHistoryLine('de do da', 'de do da')).toBe(false);
  });

  it('avisa o zero a mais ou a menos, e só isso', () => {
    expect(priceLooksOff(15, ref)).toBe(true);     // faltou um zero
    expect(priceLooksOff(1500, ref)).toBe(true);   // sobrou um zero
    expect(priceLooksOff(450, ref)).toBe(true);    // o triplo
    expect(priceLooksOff(50, ref)).toBe(true);     // um terço
    expect(priceLooksOff(449, ref)).toBe(false);
    expect(priceLooksOff(51, ref)).toBe(false);
    expect(priceLooksOff(120, ref)).toBe(false);   // desconto é normal
    expect(priceLooksOff(300, ref)).toBe(false);   // peça mais cara é normal
  });

  it('sem base ou sem valor não avisa nada', () => {
    expect(priceLooksOff(15, { price: 150, count: 4 })).toBe(false);
    expect(priceLooksOff(15, { price: null, count: 12 })).toBe(false);
    expect(priceLooksOff(15, { price: 0, count: 12 })).toBe(false);
    expect(priceLooksOff(15, undefined)).toBe(false);
    expect(priceLooksOff(undefined, ref)).toBe(false);
    expect(priceLooksOff(0, ref)).toBe(false);
    expect(priceLooksOff(-5, ref)).toBe(false);
    expect(priceLooksOff(Number.NaN, ref)).toBe(false);
  });
});
