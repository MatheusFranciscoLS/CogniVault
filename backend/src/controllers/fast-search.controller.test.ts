import assert from 'node:assert/strict';
import test from 'node:test';
import { looksLikeExactPartCode } from './fast-search.controller';

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
