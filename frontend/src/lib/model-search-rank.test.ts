import { describe, expect, it } from 'vitest';
import { machineChipLabel, modelMatchTier, rankByModel, searchModelTerm } from './model-search-rank';

describe('modelMatchTier', () => {
  it('o modelo pesquisado vem antes do parecido e do resto', () => {
    expect(modelMatchTier('HUSQVARNA Aparador de Cerca Viva Husqvarna 122 HD60', '122 HD60')).toBe(0);
    expect(modelMatchTier('IPL, 122 HD60, 2016-05', '122 HD60')).toBe(0);
    expect(modelMatchTier('IPL. IPL update, 122HD60, Ignition system', '122 HD60')).toBe(0);
    expect(modelMatchTier('HUSQVARNA 122HD60S', '122 HD60')).toBe(1);
    expect(modelMatchTier('HUSQVARNA 522HD60S', '122 HD60')).toBe(2);
    expect(modelMatchTier('Husqvarna 522iHD60', '122 HD60')).toBe(2);
    expect(modelMatchTier('IPL, 123 HD60, 2006-03', '122 HD60')).toBe(2);
  });

  it('número ou letra colado não conta como o modelo (1122 HD60 não é 122 HD60)', () => {
    expect(modelMatchTier('IPL, 1122 HD60', '122 HD60')).toBe(1);
  });

  it('termo curto demais não ordena nada', () => {
    expect(modelMatchTier('HUSQVARNA 143R', 'ab')).toBe(2);
  });
});

describe('rankByModel', () => {
  const resultados = [
    { title: 'HUSQVARNA 522HD60S' },
    { title: 'Husqvarna 522iHD60' },
    { title: 'HUSQVARNA 536LiHD60X' },
    { title: 'HUSQVARNA Aparador de Cerca Viva Husqvarna 122 HD60' },
    { title: 'HUSQVARNA 122HD60S' },
  ];

  it('o que o atendente digitou sobe para o começo, o resto mantém a ordem que veio', () => {
    expect(rankByModel(resultados, '122 HD60').map(item => item.title)).toEqual([
      'HUSQVARNA Aparador de Cerca Viva Husqvarna 122 HD60',
      'HUSQVARNA 122HD60S',
      'HUSQVARNA 522HD60S',
      'Husqvarna 522iHD60',
      'HUSQVARNA 536LiHD60X',
    ]);
  });

  it('não altera a lista original', () => {
    const copia = [...resultados];
    rankByModel(resultados, '122 HD60');
    expect(resultados).toEqual(copia);
  });
});

describe('searchModelTerm', () => {
  it('junta o número solto ao token do lado: "122 HD60" e não só "HD60"', () => {
    expect(searchModelTerm('122 HD60', 'HD60')).toBe('122HD60');
    expect(searchModelTerm('aparador 122hd60', 'HD60')).toBe('122HD60');
    expect(searchModelTerm('carburador 143RII', '143RII')).toBe('143RII');
  });

  it('sem texto que contenha o anunciado, vale o anunciado', () => {
    expect(searchModelTerm('', 'HD60')).toBe('HD60');
    expect(searchModelTerm('algo diferente', 'HD60')).toBe('HD60');
    expect(searchModelTerm('x', '')).toBe('');
  });

  it('com o termo certo, o 122 HD60 fica na frente do 123 HD60 e do 522HD60S', () => {
    const termo = searchModelTerm('122 HD60', 'HD60');
    const lista = [{ title: 'IPL, 123 HD60, 2006-03' }, { title: 'HUSQVARNA 522HD60S' }, { title: 'IPL, Husqvarna, 122 HD60, 2011-04' }];
    expect(rankByModel(lista, termo)[0].title).toBe('IPL, Husqvarna, 122 HD60, 2011-04');
    // com o pedaço anunciado sozinho, o 123 HD60 empatava com o 122 HD60: era o defeito
    expect(modelMatchTier('IPL, 123 HD60, 2006-03', 'HD60')).toBe(0);
  });
});

describe('machineChipLabel', () => {
  it('põe o modelo primeiro e a descrição ao lado', () => {
    expect(machineChipLabel('HUSQVARNA Aparador de Cerca Viva Husqvarna 122 HD60')).toEqual({ model: '122 HD60', kind: 'Aparador de Cerca Viva' });
    expect(machineChipLabel('HUSQVARNA Motosserra Husqvarna a bateria 240i (sem bateria e carregador)')).toEqual({ model: '240i', kind: 'Motosserra a bateria' });
  });

  it('sigla colada no número fica com o modelo (K 540i)', () => {
    expect(machineChipLabel('HUSQVARNA Cortadora Husqvarna K 540i')).toEqual({ model: 'K 540i', kind: 'Cortadora' });
  });

  it('título simples só perde o "HUSQVARNA" do começo', () => {
    expect(machineChipLabel('HUSQVARNA 522HD60S')).toEqual({ model: '522HD60S', kind: null });
    expect(machineChipLabel('Husqvarna 522iHD60')).toEqual({ model: '522iHD60', kind: null });
  });
});
