import test from 'node:test';
import assert from 'node:assert/strict';
import {
  iplCommentServesEngine,
  iplCommentServesPnc,
  parseHusqvarnaIplComment,
} from './husqvarna-ipl-comment';

// Todos os textos abaixo foram capturados da API real do portal:
// TS 142 (artigo 960410440) e motor HS 608 (artigo 970710701).

test('máquina → motor Husqvarna, o elo que o app resolvia com mapa escrito à mão', () => {
  const parsed = parseHusqvarnaIplComment('For 96041043000. HUSQVARNA MODEL NO. HS608 (COMPLETE IPL AVAILABLE SEPARATELY).');
  assert.deepEqual(parsed.fitsMachinePncs, ['96041043000']);
  assert.equal(parsed.engineModel, 'HS608');
  assert.equal(parsed.engineBrand, 'HUSQVARNA');
  assert.equal(parsed.hasSeparateEngineIpl, true);
  assert.equal(parsed.engineArticle, null);
});

test('motor Briggs traz modelo E artigo, que é o que faltava para o link do manual', () => {
  const briggs = parseHusqvarnaIplComment('For 96041036800, 96041036801, 96041036802, 96041036803. Engine Briggs Model No. 31R577-0027-B1 (587333501).');
  assert.deepEqual(briggs.fitsMachinePncs, ['96041036800', '96041036801', '96041036802', '96041036803']);
  assert.equal(briggs.engineModel, '31R577-0027-B1');
  assert.equal(briggs.engineBrand, 'BRIGGS');
  assert.equal(briggs.engineArticle, '587333501');

  // "B&S" é a mesma Briggs, escrito curto e em maiúsculas.
  const bs = parseHusqvarnaIplComment('ENGINE B&S MODEL NO. 44N677-0065-G1 (529581901)');
  assert.equal(bs.engineModel, '44N677-0065-G1');
  assert.equal(bs.engineBrand, 'BRIGGS');
  assert.equal(bs.engineArticle, '529581901');
  assert.deepEqual(bs.fitsMachinePncs, []);
});

test('"FOR ENGINE" decide entre os dois carburadores do HS 608', () => {
  const a = parseHusqvarnaIplComment('FOR ENGINE: 598693901');
  assert.deepEqual(a.fitsEngineArticles, ['598693901']);
  assert.deepEqual(a.fitsMachinePncs, [], 'número de motor não pode ser confundido com PNC de máquina');

  const b = parseHusqvarnaIplComment('FOR ENGINE: 596717001, 593230101');
  assert.deepEqual(b.fitsEngineArticles, ['596717001', '593230101']);

  // O caso real do balcão: TS142 com PNC 96041044000 usa o motor 598693901,
  // então o carburador certo é o 599349108 e NÃO o 599349109.
  assert.equal(iplCommentServesEngine(a, '598693901'), true);
  assert.equal(iplCommentServesEngine(b, '598693901'), false);
});

test('lista de PNC sem declaração de motor', () => {
  const parsed = parseHusqvarnaIplComment('For 96041036802, 96041036803, 96041042200');
  assert.deepEqual(parsed.fitsMachinePncs, ['96041036802', '96041036803', '96041042200']);
  assert.equal(parsed.engineModel, null);

  const um = parseHusqvarnaIplComment('For 96043031400');
  assert.deepEqual(um.fitsMachinePncs, ['96043031400']);
});

test('pacote fechado: o balcão promete uma unidade e o cliente recebe dez', () => {
  assert.equal(parseHusqvarnaIplComment('CARBURETTOR GASKET - MULTIPACK: 10').multipackQuantity, 10);
  assert.equal(parseHusqvarnaIplComment('T430: M8/6 L=147 - MULTIPACK: 2').multipackQuantity, 2);
  // "MULTIPACK: 1" não é pacote fechado, é a unidade.
  assert.equal(parseHusqvarnaIplComment('ALGO - MULTIPACK: 1').multipackQuantity, null);
});

test('texto que é só o nome em inglês não inventa dado nenhum', () => {
  for (const texto of ['MUFFLER', 'KEEPER BELT, ENGINE', 'PULLEY, ENGINE', 'GB/T 5789: M6 L=16']) {
    const parsed = parseHusqvarnaIplComment(texto);
    assert.deepEqual(parsed.fitsMachinePncs, [], texto);
    assert.deepEqual(parsed.fitsEngineArticles, [], texto);
    assert.equal(parsed.engineModel, null, texto);
  }
});

test('comment vazio ou ausente devolve tudo vazio, sem lançar', () => {
  for (const vazio of [null, undefined, '', '   ']) {
    const parsed = parseHusqvarnaIplComment(vazio);
    assert.deepEqual(parsed.fitsMachinePncs, []);
    assert.equal(parsed.engineModel, null);
    assert.equal(parsed.multipackQuantity, null);
  }
});

test('sem restrição no texto, o item vale para todas as variantes', () => {
  // Responder `false` aqui esconderia peça legítima da vista.
  const livre = parseHusqvarnaIplComment('MUFFLER');
  assert.equal(iplCommentServesPnc(livre, '96041044000'), true);
  assert.equal(iplCommentServesEngine(livre, '598693901'), true);

  const restrito = parseHusqvarnaIplComment('For 96043031400');
  assert.equal(iplCommentServesPnc(restrito, '96043031400'), true);
  assert.equal(iplCommentServesPnc(restrito, '96041044000'), false);
});

test('etiqueta de 9 dígitos casa com o "For" de 11 do catálogo', () => {
  // A etiqueta/portal usa 960410440; o texto do catálogo escreve 96041044000.
  const restrito = parseHusqvarnaIplComment('For 96041044000. HUSQVARNA MODEL NO. HS608.');
  assert.equal(iplCommentServesPnc(restrito, '960410440'), true);
  assert.equal(iplCommentServesPnc(restrito, '960410430'), false);
});

test('modelo com espaço: o TS 148 declara "HV 764cc"', () => {
  const parsed = parseHusqvarnaIplComment('Engine Husqvarna Model No. HV 764cc. Engine IPL available separately.');
  assert.equal(parsed.engineModel, 'HV 764cc', 'capturar só "HV" perderia a cilindrada');
  assert.equal(parsed.engineBrand, 'HUSQVARNA');
  assert.equal(parsed.hasSeparateEngineIpl, true);
  assert.equal(parsed.engineModelOnPlate, false);
});

test('Kawasaki: o portal não dá o modelo e manda ler a plaqueta', () => {
  // Item de motor real do Z460 (artigo 967984802).
  const parsed = parseHusqvarnaIplComment('Kawasaki - See Engine Model & Spec.');
  assert.equal(parsed.engineBrand, 'KAWASAKI');
  assert.equal(parsed.engineModel, null, 'não há modelo no texto — inventar um seria chutar o código');
  assert.equal(parsed.engineModelOnPlate, true, 'o produto precisa pedir a plaqueta do motor');
});

test('quem declara modelo não pede plaqueta', () => {
  const briggs = parseHusqvarnaIplComment('Engine Briggs Model No. 31R577-0027-B1 (587333501).');
  assert.equal(briggs.engineModelOnPlate, false);
});
