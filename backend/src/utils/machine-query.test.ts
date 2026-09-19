import test from 'node:test';
import assert from 'node:assert/strict';
import { machineQueryHint, wantsMachineLookup } from './machine-query';

test('modelo de máquina na consulta do balcão vira busca de máquina', () => {
  const casos: Array<[string, string]> = [
    ['143RII', '143RII'],
    ['carburador ts142', 'TS142'],
    ['qual a vela do LC121P', 'LC121P'],
    ['Z460', 'Z460'],
    ['HU725AWD', 'HU725AWD'],
    ['572XP', '572XP'],
  ];
  for (const [query, esperado] of casos) {
    assert.equal(machineQueryHint(query).model, esperado, query);
    assert.equal(wantsMachineLookup(query), true, query);
  }
});

test('modelo escrito com espaço no meio não é reconhecido — e isso é aceito', () => {
  // `TS 142` é como está no manual, mas juntar tokens vizinhos criaria modelo
  // de qualquer par de palavras ("junta 2" -> "JUNTA2"). O balcão digita o
  // modelo junto, que é como está na etiqueta.
  assert.equal(machineQueryHint('correia do trator TS 142').model, null);
});

test('código de peça NÃO vira consulta de máquina', () => {
  // A assinatura de código é o hífen e o dígito puro. Cada um destes dispararia
  // uma chamada externa que nunca acha máquina.
  for (const query of ['530069247', '15004-0937', '104M02-0002-F1', '967176501', '27911', '794653']) {
    const hint = machineQueryHint(query);
    assert.deepEqual(hint, { pnc: null, model: null }, query);
    assert.equal(wantsMachineLookup(query), false, query);
  }
});

test('PNC de 9 dígitos sem máscara continua sendo código de peça', () => {
  // Este é o caso que justifica a regra: PNC de máquina e código de peça
  // Husqvarna têm os mesmos 9 dígitos. Sem a máscara não há como distinguir, e
  // a busca mais comum da loja é por código de peça.
  assert.equal(machineQueryHint('967176501').pnc, null);
});

test('PNC com a máscara da etiqueta abre a máquina direto', () => {
  assert.equal(machineQueryHint('967 17 65-01').pnc, '967176501');
  assert.equal(machineQueryHint('967 17 65 01').pnc, '967176501');
  assert.equal(machineQueryHint(' 970 47 63-01 ').pnc, '970476301');
  assert.equal(machineQueryHint('967 17 65-01').model, null);
});

test('código de peça com a MESMA máscara continua sendo peça', () => {
  // Este caso derrubou a primeira versão da regra: a máscara `NNN NN NN-NN` é a
  // que está impressa na embalagem da peça também. `looksLikeExactPartCode`
  // (fast-search) já trata `587 10 67-01` como código, e é isso que o balcão
  // digita o dia inteiro — o prefixo 9 é o que separa os dois.
  for (const query of ['587 10 67-01', '530 06 92-47', '545 08 16-01']) {
    assert.equal(machineQueryHint(query).pnc, null, query);
    assert.equal(wantsMachineLookup(query), false, query);
  }
});

test('descrição pura não gasta consulta externa', () => {
  for (const query of [
    'carburador',
    'junta do carburador',
    'filtro de ar',
    'vela de ignição',
    'tampa de válvula',
    'óleo 2T',
    'óleo 10W30',
    'bateria 12V',
    'parafuso 50mm',
  ]) {
    assert.equal(wantsMachineLookup(query), false, query);
  }
});

test('medida com letra e dígito não é confundida com modelo', () => {
  for (const query of ['2T', '4T', '10W30', '12V', '50MM', '1.5L', '3000RPM']) {
    assert.equal(machineQueryHint(query).model, null, query);
  }
});

test('consulta curta demais é descartada antes de qualquer trabalho', () => {
  for (const query of ['', ' ', 'ts', '14', null, undefined]) {
    assert.deepEqual(machineQueryHint(query), { pnc: null, model: null }, String(query));
  }
});

test('só um termo de modelo por consulta, porque cada um é uma chamada externa', () => {
  assert.equal(machineQueryHint('143RII ou 122LK').model, '143RII');
});

test('modelo normaliza para maiúscula e sem pontuação decorativa', () => {
  assert.equal(machineQueryHint('husqvarna 143rii').model, '143RII');
  assert.equal(machineQueryHint('Z460®').model, 'Z460');
});
