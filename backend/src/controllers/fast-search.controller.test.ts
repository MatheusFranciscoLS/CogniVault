import assert from 'node:assert/strict';
import test from 'node:test';
import {
  looksLikeExactPartCode,
  looksLikeTechnicalCodePrefix,
  technicalCodePrefixUpperBound,
} from './fast-search.controller';

test('reconhece códigos Husqvarna numéricos com ou sem formatação', () => {
  assert.equal(looksLikeExactPartCode('587106701'), true);
  assert.equal(looksLikeExactPartCode('587 10 67-01'), true);
});

test('reconhece códigos longos alfanuméricos de motor', () => {
  assert.equal(looksLikeExactPartCode('104M02-0002-F1'), true);
});

test('não desvia modelos e pesquisas descritivas para o caminho de código', () => {
  assert.equal(looksLikeExactPartCode('143RII'), false);
  assert.equal(looksLikeExactPartCode('FR691V'), false);
  assert.equal(looksLikeExactPartCode('120 Mark II'), false);
  assert.equal(looksLikeExactPartCode('carburador'), false);
});

test('detecta prefixo técnico sem confundir modelos de máquina ou motor', () => {
  assert.equal(looksLikeTechnicalCodePrefix('58710'), true);
  assert.equal(looksLikeTechnicalCodePrefix('587 10'), true);
  assert.equal(looksLikeTechnicalCodePrefix('12345A7'), true);
  assert.equal(looksLikeTechnicalCodePrefix('MZ54'), false);
  assert.equal(looksLikeTechnicalCodePrefix('K770'), false);
  assert.equal(looksLikeTechnicalCodePrefix('FR691V'), false);
  assert.equal(looksLikeTechnicalCodePrefix('143RII'), false);
});

test('gera limite superior exclusivo para range no índice btree', () => {
  assert.equal(technicalCodePrefixUpperBound('58710'), '58711');
  assert.equal(technicalCodePrefixUpperBound('ABC99'), 'ABC9:');
});
