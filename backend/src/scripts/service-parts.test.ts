import assert from 'node:assert/strict';
import test from 'node:test';
import { diffServiceParts, parseServicePartRows } from './service-parts';

// Linhas INVENTADAS no desenho do arquivo real: codigo, pnc, reparo, descricao.
const row = (codigo: string, pnc: string, reparo: string, descricao = `PEÇA ${codigo}`) => ({ codigo, pnc, reparo, descricao });

test('fica só com revisão: preventivo, consumível e preditivo; corretivo e vazio saem', () => {
  const { links, stats } = parseServicePartRows([
    row('ZQ1', '967000001', 'PREVENTIVO'),
    row('ZQ2', '967000001', 'CONSUMÍVEL'),
    row('ZQ3', '967000001', 'PREDITIVO'),
    row('ZQ4', '967000001', 'CORRETIVO'),
    row('ZQ5', '967000001', ''),
    row('ZQ6', '967000001', 'ACESSÓRIO'),
  ]);
  assert.deepEqual(links.map(link => [link.partNumber, link.kind]), [['ZQ1', 'PREVENTIVO'], ['ZQ2', 'CONSUMIVEL'], ['ZQ3', 'PREDITIVO']]);
  assert.equal(stats.skippedKind, 3);
  assert.equal(stats.kept, 3);
});

test('PNC com 11 dígitos ou sufixo BR vira o de 9; PNC curto ou sem dígito é recusado e contado', () => {
  const { links, stats } = parseServicePartRows([
    row('ZQ1', '96700000100', 'PREVENTIVO'),
    row('ZQ2', '967000002BR', 'PREVENTIVO'),
    row('ZQ3', '12345', 'PREVENTIVO'),
    row('ZQ4', '', 'PREVENTIVO'),
    row('ZQ5', 'abc', 'PREVENTIVO'),
  ]);
  assert.deepEqual(links.map(link => link.pnc), ['967000001', '967000002']);
  assert.equal(stats.badPnc, 3);
});

test('código vazio ou só traço é recusado; o mesmo código normalizado na mesma máquina é um só, e o tipo mais forte vence', () => {
  const { links, stats } = parseServicePartRows([
    row('', '967000001', 'PREVENTIVO'),
    row('-', '967000001', 'PREVENTIVO'),
    row('ZQ 7-1', '967000001', 'CONSUMÍVEL'),
    row('ZQ71', '967000001', 'PREVENTIVO'),
    row('ZQ71', '967000002', 'CONSUMÍVEL'),
  ]);
  assert.equal(stats.badCode, 2);
  assert.deepEqual(links.map(link => [link.pnc, link.normalizedNumber, link.kind]), [['967000001', 'ZQ71', 'PREVENTIVO'], ['967000002', 'ZQ71', 'CONSUMIVEL']]);
});

test('entrada que não é lista, ou linha que não é objeto, não lança', () => {
  for (const bad of [undefined, null, 'x', 42, {}]) assert.deepEqual(parseServicePartRows(bad).links, []);
  assert.deepEqual(parseServicePartRows([null, 3, 'a', []]).links, []);
});

test('o nome vem da lista; sem nome usa o código', () => {
  const { links } = parseServicePartRows([row('ZQ1', '967000001', 'PREVENTIVO', 'VELA DE IGNIÇÃO'), { codigo: 'ZQ2', pnc: '967000001', reparo: 'PREVENTIVO' }]);
  assert.deepEqual(links.map(link => link.name), ['VELA DE IGNIÇÃO', 'ZQ2']);
});

test('diff: o que entra, o que sai, e lista sem ligações NÃO apaga o que já existe', () => {
  const stored = [
    { pnc: '967000001', normalizedNumber: 'ZQ1', kind: 'PREVENTIVO' },
    { pnc: '967000001', normalizedNumber: 'ZQ2', kind: 'PREVENTIVO' },
    { pnc: '967000009', normalizedNumber: 'ZQ9', kind: 'CONSUMIVEL' },
  ];
  const incoming = parseServicePartRows([row('ZQ1', '967000001', 'PREVENTIVO'), row('ZQ2', '967000001', 'CONSUMÍVEL'), row('ZQ3', '967000002', 'PREVENTIVO')]).links;
  const diff = diffServiceParts(stored, incoming);
  // ZQ2 mudou de tipo (sai o antigo, entra o novo), ZQ3 é novo, ZQ9 não está mais na lista.
  assert.deepEqual([diff.added, diff.removed, diff.machines, diff.stored, diff.incoming], [2, 2, 2, 3, 3]);
  assert.deepEqual(diffServiceParts(stored, []), { stored: 3, incoming: 0, added: 0, removed: 0, machines: 0 });
  assert.deepEqual([diffServiceParts([], incoming).added, diffServiceParts([], incoming).removed], [3, 0]);
});
