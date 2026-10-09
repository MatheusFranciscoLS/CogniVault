import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBarRange, parsePublicMachineUse } from './husqvarna-public-specs';
import { publicSpecsArticleId } from '../services/husqvarna-public-specs.service';

const answer = (values: Array<{ id: string; formattedValue?: string; numericValue?: number | null }> | undefined) =>
  ({ site: { articles: { byIds: [{ id: '965801490', specificationValues: values }] } } });

test('motosserra profissional: classe de uso traduzida e faixa de sabre (formato medido na 281XP)', () => {
  const use = parsePublicMachineUse(answer([
    { id: 'TD3_metric', formattedValue: '4,2 kW', numericValue: 4.2 },
    { id: 'TD32_1_metric', formattedValue: '38 cm', numericValue: 38 },
    { id: 'TD32_2_metric', formattedValue: '70 cm', numericValue: 70 },
    { id: 'WEB_ChainsawSubGroup', formattedValue: 'Full time professional use chainsaws', numericValue: null },
  ]));
  assert.deepEqual(use, { useClass: 'Uso profissional em tempo integral', barMinCm: 38, barMaxCm: 70 });
  assert.equal(formatBarRange(use!), '38 a 70 cm');
});

test('as quatro classes de motosserra e as três de soprador são conhecidas', () => {
  const chainsaw = (value: string) => parsePublicMachineUse(answer([{ id: 'WEB_ChainsawSubGroup', formattedValue: value }]))?.useClass;
  assert.equal(chainsaw('Occasional use chainsaws'), 'Uso ocasional');
  assert.equal(chainsaw('Part time use chainsaws'), 'Uso em tempo parcial');
  assert.equal(chainsaw('Arborists Tree-care chainsaws'), 'Uso em poda e cuidado de árvores (arborista)');
  const blower = (value: string) => parsePublicMachineUse(answer([{ id: 'ART_647', formattedValue: value }]))?.useClass;
  assert.equal(blower('Uso residencial ocasional'), 'Uso residencial ocasional');
  assert.equal(blower('Uso residencial intensivo'), 'Uso residencial intensivo');
  assert.equal(blower('Uso profissional'), 'Uso profissional');
});

test('valor que não conhecemos NÃO vira texto (nada é inventado ou traduzido por palpite)', () => {
  const use = parsePublicMachineUse(answer([{ id: 'WEB_ChainsawSubGroup', formattedValue: 'Space chainsaws' }, { id: 'ART_647', formattedValue: 'Uso lunar' }]));
  assert.equal(use?.useClass, null);
});

test('máquina sem classe de uso (roçadeira, giro zero...) devolve tudo vazio, sem erro', () => {
  assert.deepEqual(parsePublicMachineUse(answer([{ id: 'TD3_metric', formattedValue: '1,2 kW', numericValue: 1.2 }])), { useClass: null, barMinCm: null, barMaxCm: null });
  assert.deepEqual(parsePublicMachineUse(answer([])), { useClass: null, barMinCm: null, barMaxCm: null });
});

test('o site sem o artigo ou com resposta torta é "não tem" (null), nunca exceção', () => {
  assert.equal(parsePublicMachineUse({ site: { articles: { byIds: [null] } } }), null);
  assert.equal(parsePublicMachineUse({ site: { articles: { byIds: [] } } }), null);
  assert.equal(parsePublicMachineUse(null), null);
  assert.equal(parsePublicMachineUse(undefined), null);
  assert.equal(parsePublicMachineUse('lixo'), null);
  assert.equal(parsePublicMachineUse(answer(undefined)), null);
});

test('faixa de sabre: as duas pontas ou nenhuma; ponta invertida, zero e absurdo são descartados', () => {
  const range = (min: unknown, max: unknown) => {
    const use = parsePublicMachineUse(answer([{ id: 'TD32_1_metric', numericValue: min as number }, { id: 'TD32_2_metric', numericValue: max as number }]))!;
    return [use.barMinCm, use.barMaxCm];
  };
  assert.deepEqual(range(30, 35), [30, 35]);
  assert.deepEqual(range(35, 30), [null, null]);
  assert.deepEqual(range(38, null), [null, null]);
  assert.deepEqual(range(0, 40), [null, null]);
  assert.deepEqual(range(40, 99999), [null, null]);
  assert.equal(formatBarRange({ barMinCm: 35, barMaxCm: 35 }), '35 cm');
  assert.equal(formatBarRange({ barMinCm: 33.5, barMaxCm: 70 }), '33,5 a 70 cm');
  assert.equal(formatBarRange({ barMinCm: null, barMaxCm: null }), null);
});

test('PNC da lista: 9 dígitos, com ou sem BR; o resto não consulta o site', () => {
  assert.equal(publicSpecsArticleId('965801490'), '965801490');
  assert.equal(publicSpecsArticleId('965801490BR'), '965801490');
  assert.equal(publicSpecsArticleId(' 965801490br '), '965801490');
  assert.equal(publicSpecsArticleId('965 801 490'), '965801490');
  assert.equal(publicSpecsArticleId('96580149000'), null);
  assert.equal(publicSpecsArticleId('9658014'), null);
  assert.equal(publicSpecsArticleId('970466903CJ'), null);
  assert.equal(publicSpecsArticleId(''), null);
  assert.equal(publicSpecsArticleId(null), null);
});
