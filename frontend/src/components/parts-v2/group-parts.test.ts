import { describe, expect, it } from 'vitest';
import { alsoInLabel, groupPartsByCode, nameContainsPhrase } from './group-parts';

const part = (partNumber: string, model: string, id = `${partNumber}-${model}`) => ({ id, partNumber, model });

describe('groupPartsByCode', () => {
  it('junta o mesmo código de vários modelos em uma linha, na ordem da busca', () => {
    const groups = groupPartsByCode([
      part('501691702', '545F', 'a'),
      part('537331501', '545F', 'b'),
      part('501691702', '545F', 'c'),
      part('501691702', '545RX', 'd'),
    ]);

    expect(groups.map(group => group.main.id)).toEqual(['a', 'b']);
    expect(groups[0].others.map(item => item.id)).toEqual(['c', 'd']);
    expect(groups[1].others).toEqual([]);
  });

  it('a primeira ocorrência (a melhor ranqueada) é a principal: ela abre os detalhes e entra no orçamento', () => {
    const [group] = groupPartsByCode([part('587106701', '143RII', 'melhor'), part('587106701', '531RS', 'outra')]);
    expect(group.main.id).toBe('melhor');
  });

  it('código com espaço, traço ou caixa diferente é o mesmo código', () => {
    const groups = groupPartsByCode([part('587 10 67-01', '143RII'), part('587106701', '531RS')]);
    expect(groups).toHaveLength(1);
  });

  it('códigos diferentes nunca se juntam (sem chute)', () => {
    expect(groupPartsByCode([part('587106701', '143RII'), part('587106702', '143RII')])).toHaveLength(2);
  });

  it('lista vazia continua vazia', () => {
    expect(groupPartsByCode([])).toEqual([]);
  });
});

describe('alsoInLabel', () => {
  it('lista os outros modelos, sem repetir o principal', () => {
    expect(alsoInLabel('545F', [{ model: '545F' }, { model: '545RX' }, { model: '545RX' }])).toBe('545RX');
  });

  it('abrevia depois de dois modelos', () => {
    expect(alsoInLabel('A', [{ model: 'B' }, { model: 'C' }, { model: 'D' }, { model: 'E' }])).toBe('B, C +2');
  });

  it('sem outros modelos, não escreve nada', () => {
    expect(alsoInLabel('545F', [{ model: '545F' }])).toBe('');
    expect(alsoInLabel('545F', [])).toBe('');
  });
});

describe('nameContainsPhrase', () => {
  it('ignora acento e caixa: "vela de ignição" acha "VELA DE IGNICAO HQT-7"', () => {
    expect(nameContainsPhrase('VELA DE IGNICAO HQT-7', 'vela de ignição')).toBe(true);
  });

  it('não confunde peça que só tem uma das palavras', () => {
    expect(nameContainsPhrase('CHAVE COMBINADA (VELA) 13-19MM', 'vela de ignição')).toBe(false);
  });

  it('busca curtinha demais ou vazia não decide ordem nenhuma', () => {
    expect(nameContainsPhrase('VELA', '')).toBe(false);
    expect(nameContainsPhrase('VELA', 've')).toBe(false);
  });

  it('espaço duplicado na pergunta não atrapalha', () => {
    expect(nameContainsPhrase('FILTRO DE AR', '  filtro   de ar ')).toBe(true);
  });
});
