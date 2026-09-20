import test from 'node:test';
import assert from 'node:assert/strict';
import { machineOilFamily, oilSuggestions } from './machine-oil';

test('roçadeira leva óleo 2 tempos', () => {
  for (const modelo of ['143RII', '143R-II', '236R', '541RS', '128R', '226R']) {
    assert.equal(machineOilFamily(modelo), 'TWO_STROKE', modelo);
    assert.deepEqual(oilSuggestions(modelo).map(o => o.kind), ['TWO_STROKE'], modelo);
  }
});

test('motosserra e podador levam a mistura E o óleo de corrente', () => {
  for (const modelo of ['236', '450', '272XP', '372XP', '525P', '327P']) {
    assert.equal(machineOilFamily(modelo), 'CHAINSAW', modelo);
    assert.deepEqual(oilSuggestions(modelo).map(o => o.kind), ['TWO_STROKE', 'CHAIN'], modelo);
  }
});

test('cortador leva 20W50', () => {
  for (const modelo of ['LC121P', 'LC140', 'LC140S', 'LB155S', 'HU725AWD', 'J55SL']) {
    assert.equal(machineOilFamily(modelo), 'MOWER', modelo);
    assert.deepEqual(oilSuggestions(modelo).map(o => o.kind), ['MOWER_20W50'], modelo);
  }
});

test('LC121P é CORTADOR, não podador — o P do fim engana', () => {
  // Se o sufixo fosse testado antes do prefixo, este cortador de grama levaria
  // óleo de corrente. É o erro que a ordem das regras evita.
  assert.equal(machineOilFamily('LC121P'), 'MOWER');
  assert.equal(oilSuggestions('LC121P').some(o => o.kind === 'CHAIN'), false);
});

test('trator, giro zero e Rider levam 15W50', () => {
  // O Rider (R112C, V548, V554) é o cortador em que o operador senta. Entra
  // aqui e não em cortador porque ele tem câmbio, e a regra do dono para 15W50
  // é "motor de trator/giro zero e cambio" — confirmado por ele.
  for (const modelo of ['TS142', 'TS148', 'LT125', 'Z460', 'YTH1842', 'R112C', 'V548', 'V554']) {
    assert.equal(machineOilFamily(modelo), 'TRACTOR', modelo);
    assert.deepEqual(oilSuggestions(modelo).map(o => o.kind), ['TRACTOR_15W50'], modelo);
  }
});

test('nenhum Rider cai em desconhecido — era o buraco que a medição achou', () => {
  // A primeira versão mandava 20W50 no R112C (errado) e não sabia classificar
  // V548/V554. Os dois defeitos vinham da mesma lacuna.
  for (const modelo of ['R112C', 'V548', 'V554']) {
    assert.notEqual(machineOilFamily(modelo), 'UNKNOWN', modelo);
    assert.notEqual(machineOilFamily(modelo), 'MOWER', modelo);
    assert.equal(oilSuggestions(modelo).length, 1, modelo);
  }
});

test('15W40 não existe no catálogo de óleo da loja', () => {
  // Decisão do dono: "o oleo 15w40 não vendemos por conta que o 15w50 é melhor".
  const todos = [...oilSuggestions(null), ...oilSuggestions('TS142'), ...oilSuggestions('LC121P')];
  assert.equal(todos.some(o => /15W40/i.test(o.label)), false);
});

test('máquina que eu não sei classificar mostra as OPÇÕES, não um palpite', () => {
  // Recomendar 20W50 num motor 2 tempos estraga o motor do cliente. Quando não
  // dá para afirmar, o atendente escolhe — foi o desenho que o dono pediu.
  for (const modelo of ['', null, 'XYZ999', 'MODELO NOVO 2027']) {
    assert.equal(machineOilFamily(modelo), 'UNKNOWN', String(modelo));
    assert.equal(oilSuggestions(modelo).length, 4, String(modelo));
  }
});

test('todo óleo entra como linha avulsa, nunca como código de peça', () => {
  // O prefixo SRV- é o que faz a cesta mostrar "SERVIÇO / AVULSO" em vez de um
  // código. Óleo com cara de código de peça seria exatamente o defeito que este
  // produto existe para evitar.
  for (const modelo of ['143RII', 'TS142', 'LC121P', '450', null]) {
    for (const oleo of oilSuggestions(modelo)) {
      assert.ok(oleo.code.startsWith('SRV-'), `${modelo} -> ${oleo.code}`);
      assert.ok(oleo.label.length > 3);
    }
  }
});
