import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHistoryIndex, topFromHistory, type HistoryLine } from './repair-history';

const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 9, 9);
let n = 0;
const line = (quoteId: string, name: string, unitPrice: number, daysAgo: number, extra: Partial<HistoryLine> = {}): HistoryLine => ({
  quoteId, savedAt: NOW - daysAgo * DAY + (n += 1), name, partNumber: null, unitPrice, leadTime: 'Pronta entrega', isService: false, ...extra,
});

// 10 OS recentes (até 60 dias) e 10 OS antigas (400+ dias). Vela só nas antigas; filtro nas duas; carburador só nas recentes; mão de obra em todas.
const historico = () => {
  const lines: HistoryLine[] = [];
  for (let i = 0; i < 10; i += 1) {
    lines.push(line(`r${i}`, 'MÃO DE OBRA', 150, i * 6, { isService: true, leadTime: null }));
    lines.push(line(`r${i}`, 'CARBURADOR', 300, i * 6));
    if (i < 6) lines.push(line(`r${i}`, 'FILTRO GASOLINA', 20, i * 6));
  }
  for (let i = 0; i < 10; i += 1) {
    lines.push(line(`a${i}`, 'MAO DE OBRA', 100, 400 + i * 10, { isService: true, leadTime: null }));
    lines.push(line(`a${i}`, 'VELA', 10, 400 + i * 10));
    if (i < 8) lines.push(line(`a${i}`, 'FILTRO DE GASOLINA', 12, 400 + i * 10));
  }
  lines.push(line('r0', 'PEÇA ÚNICA', 5, 1));
  return buildHistoryIndex(lines);
};

test('últimos 12 meses: só o que foi orçado no período, com o valor e a conta do período', () => {
  const { totalOrders, items } = topFromHistory(historico(), NOW - 365 * DAY);
  assert.equal(totalOrders, 10, 'só as 10 OS recentes contam');
  assert.deepEqual(items.map(item => [item.name.replace(' de ', ' '), item.orders, item.percent]), [['Carburador', 10, 100], ['Filtro gasolina', 6, 60]], 'a grafia mostrada é a mais usada no histórico todo');
  assert.equal(items[0].price, 300);
  assert.equal(items[1].price, 20, 'o valor é o do período (20), não o das OS antigas (12)');
  assert.ok(!items.some(item => /vela/i.test(item.name)), 'vela só foi orçada há mais de um ano');
});

test('todo o histórico: as grafias juntas e o que mais se orça em primeiro', () => {
  const { totalOrders, items } = topFromHistory(historico(), null);
  assert.equal(totalOrders, 20);
  assert.deepEqual(items.map(item => item.name.replace(' de ', ' ')), ['Filtro gasolina', 'Carburador', 'Vela'], 'empate (10 e 10) desempata por nome');
  const filtro = items.find(item => /filtro/i.test(item.name))!;
  assert.equal(filtro.orders, 14, 'FILTRO GASOLINA (6) e FILTRO DE GASOLINA (8) são a mesma linha');
  assert.equal(filtro.percent, 70);
});

test('mão de obra e linha de uma OS só nunca entram: é lista de PEÇA para o estoque', () => {
  for (const since of [null, NOW - 365 * DAY, NOW - 30 * DAY]) {
    const { items } = topFromHistory(historico(), since);
    assert.ok(!items.some(item => item.isService || /obra/i.test(item.name)), 'sem mão de obra');
    assert.ok(!items.some(item => /única/i.test(item.name)), 'linha de uma OS só fica de fora');
  }
});

test('período sem nenhuma OS, índice vazio e limite fora do normal não quebram', () => {
  assert.deepEqual(topFromHistory(historico(), NOW + 10 * DAY), { totalOrders: 0, items: [] });
  assert.deepEqual(topFromHistory(buildHistoryIndex([]), null), { totalOrders: 0, items: [] });
  assert.equal(topFromHistory(historico(), null, 1).items.length, 1);
  assert.ok(topFromHistory(historico(), null, 0).items.length >= 1, 'limite zero vira pelo menos 1');
  assert.ok(topFromHistory(historico(), null, 10_000).items.length <= 100, 'limite enorme é cortado');
});
