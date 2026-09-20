import test from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeDescription } from './part-picker.service';

// O que decide se a IA é acionada. Cada chamada gasta cota de um plano
// gratuito, então errar para MAIS aqui custa dinheiro do dono.

test('frase do cliente aciona o palpite', () => {
  for (const frase of [
    'a peça que segura a lâmina',
    'o negócio que puxa a corda',
    'o plástico do lado do filtro',
    'aquela tampa preta do motor',
    'peça que prende o cabo do acelerador',
  ]) {
    assert.equal(looksLikeDescription(frase), true, frase);
  }
});

test('código NÃO aciona — a busca determinística já responde', () => {
  // Estes têm caminho exato e barato. Mandar para a IA seria gasto puro.
  for (const codigo of [
    '587106701',
    '587 10 67-01',
    '104M02-0002-F1',
    'FX921V-ES06',
    '15004-0937',
    '967332901',
  ]) {
    assert.equal(looksLikeDescription(codigo), false, codigo);
  }
});

test('palavra solta não aciona', () => {
  // "carburador" a busca léxica acha sozinha. Uma palavra não é descrição.
  for (const termo of ['carburador', 'junta', 'filtro', '143RII', 'vela']) {
    assert.equal(looksLikeDescription(termo), false, termo);
  }
});

test('texto curto demais e longo demais não acionam', () => {
  assert.equal(looksLikeDescription('a peça'), false);
  assert.equal(looksLikeDescription(''), false);
  assert.equal(looksLikeDescription('   '), false);
  assert.equal(looksLikeDescription('peça '.repeat(40)), false);
});

test('modelo com descrição curta junto não aciona pelo lado do código', () => {
  // "143RII carburador" tem dígito demais para ser descrição e a busca normal
  // resolve — é peça + modelo, o caminho que já funciona.
  assert.equal(looksLikeDescription('143RII 967332901'), false);
});

test('valor não-texto não quebra nem aciona', () => {
  for (const v of [null, undefined, 0, {}, []] as unknown[]) {
    assert.equal(looksLikeDescription(v as string), false, JSON.stringify(v));
  }
});
