import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHistoryIndex, displayName, historyKey, suggestFromHistory, togetherFromHistory, type HistoryLine } from './repair-history';

const DAY = 24 * 3600 * 1000;
let counter = 0;
const line = (quoteId: string, name: string, unitPrice: number, extra: Partial<HistoryLine> = {}): HistoryLine => ({
  quoteId, savedAt: Date.UTC(2026, 0, 1) + (counter += 1) * DAY, name, partNumber: null, unitPrice, leadTime: 'Pronta entrega', isService: false, ...extra,
});

test('a chave junta as grafias da mesma linha e separa o que é diferente', () => {
  assert.equal(historyKey('FILTRO DE GASOLINA'), historyKey('Filtro  gasolina'));
  assert.equal(historyKey('MÃO DE OBRA'), historyKey('MAO DE OBRA'));
  assert.equal(historyKey('RETENTOR DO MOTOR'), historyKey('retentor motor'));
  assert.equal(historyKey('ÓLEO 20W50'), historyKey('OLEO 20W50'));
  assert.equal(historyKey('ÓLEO 20W50 (0,3)'), historyKey('OLEO 20W50'), 'a quantidade quebrada da importação não separa a linha');
  assert.notEqual(historyKey('FILTRO DE AR'), historyKey('FILTRO GASOLINA'));
  assert.notEqual(historyKey('ÓLEO 20W50'), historyKey('ÓLEO 2T'));
  assert.equal(historyKey(''), null);
  assert.equal(historyKey('   '), null);
  assert.equal(historyKey('DE DO DA'), null);
  assert.equal(historyKey('x'.repeat(500)), null);
  assert.equal(historyKey(null as never), null);
});

test('nome de planilha em caixa alta vira frase; sigla e medida ficam como estão', () => {
  assert.equal(displayName('FILTRO GASOLINA'), 'Filtro gasolina');
  assert.equal(displayName('ÓLEO 20W50'), 'Óleo 20W50');
  assert.equal(displayName('Filtro de ar'), 'Filtro de ar', 'o que o balcão escreveu não é mexido');
  assert.equal(displayName('CARBURADOR (0,3)'), 'Carburador');
  assert.equal(displayName('A1'), 'A1');
});

const historico = () => {
  const lines: HistoryLine[] = [];
  // 12 OS de carburador: 8 com filtro de gasolina, 5 com mangueira, 1 com vela; todas com mão de obra
  for (let i = 0; i < 12; i += 1) {
    lines.push(line(`os${i}`, 'CARBURADOR', 200 + i, { partNumber: i % 2 ? '4203-120-0610' : null }));
    lines.push(line(`os${i}`, 'MÃO DE OBRA', 150, { isService: true, leadTime: null }));
    if (i < 8) lines.push(line(`os${i}`, i % 3 ? 'FILTRO GASOLINA' : 'FILTRO DE GASOLINA', 15, { partNumber: '503443201' }));
    if (i < 5) lines.push(line(`os${i}`, 'MANGUEIRA GASOLINA', 3));
    if (i === 0) lines.push(line(`os${i}`, 'VELA', 24));
  }
  lines.push(line('osX', 'PEÇA RARA', 99));
  return buildHistoryIndex(lines);
};

test('sugestão: começo de palavra, grafias juntas, mais usadas primeiro, ruído de uma vez só fora', () => {
  const index = historico();
  const filtro = suggestFromHistory(index, 'filtro gas');
  assert.equal(filtro.length, 1, 'as duas grafias viram uma só linha');
  assert.equal(filtro[0].count, 8);
  assert.equal(filtro[0].price, 15);
  assert.equal(filtro[0].partNumber, '503443201');
  assert.equal(filtro[0].leadTime, 'Pronta entrega');
  assert.deepEqual(suggestFromHistory(index, 'carb').map(item => item.name), ['Carburador']);
  assert.deepEqual(suggestFromHistory(index, 'rara'), [], 'linha que só apareceu em uma OS não é sugestão');
  assert.deepEqual(suggestFromHistory(index, 'peça rara').map(item => item.name), ['Peça rara'], 'a não ser que seja exatamente o digitado');
  assert.deepEqual(suggestFromHistory(index, 'm'), [], 'uma letra só não sugere nada');
});

test('sugestão pelo CÓDIGO digitado, com ou sem traço, em minúsculo', () => {
  const index = historico();
  assert.deepEqual(suggestFromHistory(index, '4203-120').map(item => item.name), ['Carburador']);
  assert.deepEqual(suggestFromHistory(index, '4203120').map(item => item.name), ['Carburador']);
  assert.deepEqual(suggestFromHistory(index, '503443').map(item => item.name), ['Filtro gasolina']);
  assert.deepEqual(suggestFromHistory(index, '999999'), []);
});

test('mão de obra: valor de referência, e SEM prazo de peça', () => {
  const [labor] = suggestFromHistory(historico(), 'mao de obra');
  assert.equal(labor.isService, true);
  assert.equal(labor.price, 150);
  assert.equal(labor.leadTime, null);
});

test('o valor de referência é o RECENTE: o preço de anos atrás não puxa a mediana', () => {
  const lines: HistoryLine[] = [];
  for (let i = 0; i < 10; i += 1) lines.push({ quoteId: `v${i}`, savedAt: Date.UTC(2019, 0, 1) + i * DAY, name: 'VELA', partNumber: null, unitPrice: 10, leadTime: 'Pronta entrega', isService: false });
  for (let i = 0; i < 10; i += 1) lines.push({ quoteId: `n${i}`, savedAt: Date.UTC(2026, 0, 1) + i * DAY, name: 'VELA', partNumber: null, unitPrice: 30, leadTime: 'Pronta entrega', isService: false });
  assert.equal(suggestFromHistory(buildHistoryIndex(lines), 'vela')[0].price, 30);
});

test('prazo: o mais comum entre as ocorrências recentes', () => {
  const lines = [1, 2, 3, 4, 5].map(i => line(`p${i}`, 'PISTÃO', 110, { leadTime: i <= 4 ? '10 dias' : 'Pronta entrega' }));
  assert.equal(suggestFromHistory(buildHistoryIndex(lines), 'pistao')[0].leadTime, '10 dias');
});

test('costuma levar junto: porcentagem sobre as OS da peça, sem mão de obra e sem o que já está no orçamento', () => {
  const index = historico();
  const junto = togetherFromHistory(index, 'Carburador');
  assert.deepEqual(junto.map(item => [item.name, item.percent]), [['Filtro gasolina', 67], ['Mangueira gasolina', 42]]);
  assert.ok(!junto.some(item => item.isService), 'mão de obra nunca é sugerida');
  assert.ok(!junto.some(item => /vela/i.test(item.name)), 'uma OS só (8%) não é padrão');
  const semFiltro = togetherFromHistory(index, 'carburador', ['filtro de gasolina']);
  assert.deepEqual(semFiltro.map(item => item.name), ['Mangueira gasolina'], 'o que o orçamento já tem não é sugerido de novo');
  assert.deepEqual(togetherFromHistory(index, 'peça rara'), [], 'pouca base não conclui nada');
  assert.deepEqual(togetherFromHistory(index, 'coisa que nunca foi orçada'), []);
  assert.deepEqual(togetherFromHistory(index, ''), []);
});

test('entrada hostil não quebra nem demora', () => {
  const index = historico();
  const started = Date.now();
  for (const query of ['', ' ', '%', "'; DROP TABLE", '\u0000', 'a'.repeat(100_000), '日本語', '((((', '4203-', '--']) {
    assert.ok(Array.isArray(suggestFromHistory(index, query)));
  }
  assert.ok(Date.now() - started < 500);
});

test('índice vazio responde vazio', () => {
  const vazio = buildHistoryIndex([]);
  assert.deepEqual(suggestFromHistory(vazio, 'carburador'), []);
  assert.deepEqual(togetherFromHistory(vazio, 'carburador'), []);
});

test('código SRV-n (que o sistema dá a linha sem código) nunca vira código sugerido', () => {
  const lines = [1, 2, 3].map(i => line(`s${i}`, 'CARBURADOR', 200, { partNumber: 'SRV-1' }));
  const [carb] = suggestFromHistory(buildHistoryIndex(lines), 'carburador');
  assert.equal(carb.partNumber, null);
});

test('pelo código: manda quem mais vezes tem aquele código, e o código mostrado é o digitado', () => {
  const lines: HistoryLine[] = [];
  for (let i = 0; i < 6; i += 1) lines.push(line(`a${i}`, 'MANGUEIRA GASOLINA', 27, { partNumber: i === 0 ? '4203-999' : 'VI00164' }));
  for (let i = 0; i < 4; i += 1) lines.push(line(`b${i}`, 'KIT CILINDRO', 235, { partNumber: '4203-020-1201' }));
  const result = suggestFromHistory(buildHistoryIndex(lines), '4203');
  assert.deepEqual(result.map(item => item.name), ['Kit cilindro', 'Mangueira gasolina']);
  assert.equal(result[0].partNumber, '4203-020-1201');
  assert.equal(result[1].partNumber, '4203-999');
});
