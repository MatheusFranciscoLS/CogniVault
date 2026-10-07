import { describe, expect, it } from 'vitest';
import { OIL_OPTIONS, looksLikeOilQuery } from './oil-query';

describe('looksLikeOilQuery', () => {
  it('reconhece a pergunta pelo óleo, com ou sem acento', () => {
    expect(looksLikeOilQuery('óleo 2 tempos')).toBe(true);
    expect(looksLikeOilQuery('oleo de corrente')).toBe(true);
    expect(looksLikeOilQuery('Óleo')).toBe(true);
    expect(looksLikeOilQuery('oleo 20w50')).toBe(true);
    expect(looksLikeOilQuery('20W50')).toBe(true);
  });

  it('não confunde com peça ligada a óleo (filtro, bujão, tampa...)', () => {
    expect(looksLikeOilQuery('filtro de óleo')).toBe(false);
    expect(looksLikeOilQuery('bujão do óleo')).toBe(false);
    expect(looksLikeOilQuery('tampa do reservatório de óleo')).toBe(false);
    expect(looksLikeOilQuery('bomba de oleo')).toBe(false);
  });

  it('busca comum não oferece óleo', () => {
    expect(looksLikeOilQuery('vela de ignição')).toBe(false);
    expect(looksLikeOilQuery('carburador 143RII')).toBe(false);
    expect(looksLikeOilQuery('587106701')).toBe(false);
    expect(looksLikeOilQuery('')).toBe(false);
  });

  it('são os quatro óleos que a loja vende, com código de linha avulsa (SRV-)', () => {
    expect(OIL_OPTIONS).toHaveLength(4);
    expect(OIL_OPTIONS.every(option => option.code.startsWith('SRV-'))).toBe(true);
    expect(OIL_OPTIONS.map(option => option.label)).toEqual(['Óleo 2 tempos', 'Óleo de corrente', 'Óleo 20W50', 'Óleo 15W50']);
  });
});
