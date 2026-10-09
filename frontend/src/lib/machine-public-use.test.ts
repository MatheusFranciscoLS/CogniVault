import { describe, expect, it } from 'vitest';
import { mergeBulletLines, publicUseLines } from './machine-public-use';

describe('uso recomendado do site público no orçamento da máquina', () => {
  it('motosserra: classe de uso e faixa de sabre', () => {
    expect(publicUseLines({ useClass: 'Uso profissional em tempo integral', barMinCm: 38, barMaxCm: 70 })).toEqual([
      'Uso profissional em tempo integral',
      'Sabres compatíveis: 38 a 70 cm',
    ]);
    expect(publicUseLines({ useClass: null, barMinCm: 35, barMaxCm: 35 })).toEqual(['Sabres compatíveis: 35 cm']);
    expect(publicUseLines({ useClass: null, barMinCm: 33.5, barMaxCm: 70 })).toEqual(['Sabres compatíveis: 33,5 a 70 cm']);
  });

  it('sem dado (roçadeira, máquina fora do site, site fora do ar) não aparece nada', () => {
    expect(publicUseLines(null)).toEqual([]);
    expect(publicUseLines(undefined)).toEqual([]);
    expect(publicUseLines({ useClass: null, barMinCm: null, barMaxCm: null })).toEqual([]);
    expect(publicUseLines({ useClass: null, barMinCm: 40, barMaxCm: null })).toEqual([]);
    expect(publicUseLines({ useClass: null, barMinCm: 70, barMaxCm: 38 })).toEqual([]);
  });

  it('resposta fora do formato vira "sem dado" e nunca lança (derrubaria a tela do orçamento)', () => {
    const torta = (value: unknown) => publicUseLines(value as never);
    expect(torta({ useClass: 42, barMinCm: 'abc', barMaxCm: null })).toEqual([]);
    expect(torta({ useClass: '  ', barMinCm: NaN, barMaxCm: Infinity })).toEqual([]);
    expect(torta({ useClass: {}, barMinCm: -3, barMaxCm: 10 })).toEqual([]);
    expect(torta('texto')).toEqual([]);
    expect(torta(7)).toEqual([]);
    expect(torta([])).toEqual([]);
  });

  it('juntar com a lista de preços não repete a mesma frase e mantém as do site primeiro', () => {
    expect(mergeBulletLines(['Uso profissional'], ['Sabre 20" Ponta Dura', 'uso  profissional', 'Corrente 3/8"'])).toEqual([
      'Uso profissional',
      'Sabre 20" Ponta Dura',
      'Corrente 3/8"',
    ]);
    expect(mergeBulletLines([], ['A', 'B'])).toEqual(['A', 'B']);
  });
});
