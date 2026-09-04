import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackIntent, extractLikelyPartNumber, extractLikelyModel } from './chat-reliability';
import { allRelatedPartNumbers } from './part-supersession';
import { normalizeIdentifier } from '../utils/normalize';

test('extrai com precisão o código da peça e o termo descritivo em consultas mistas', () => {
  const query = 'carburador 587106701';
  const likelyCode = extractLikelyPartNumber(query);
  assert.equal(likelyCode, '587106701');

  const intent = buildFallbackIntent(query);
  assert.equal(intent.partNumber, '587106701');

  // Verifica que o código isolado permite expansão de substituição oficial
  const related = allRelatedPartNumbers(normalizeIdentifier(likelyCode));
  assert.ok(related.includes('587106701'));
  assert.ok(related.includes('586931401'));
});

test('extrai corretamente modelo e código em buscas compostas de balcão', () => {
  const query = '143RII 587106701';
  const likelyCode = extractLikelyPartNumber(query);
  assert.equal(likelyCode, '587106701');

  const model = extractLikelyModel(query);
  assert.equal(model, '143RII');

  const intent = buildFallbackIntent(query);
  assert.equal(intent.model, '143RII');
  assert.equal(intent.partNumber, '587106701');
});

test('extrai código com hífen e termos de giro zero', () => {
  const query = 'correia deck 532 19 33-50';
  const likelyCode = extractLikelyPartNumber(query);
  assert.equal(normalizeIdentifier(likelyCode), '532193350');
});

test('isola código da Kawasaki em busca mista', () => {
  const query = 'filtro de oleo 49065-7007 FR691V';
  const likelyCode = extractLikelyPartNumber(query);
  assert.equal(normalizeIdentifier(likelyCode), '490657007');

  const model = extractLikelyModel(query);
  assert.equal(model, 'FR691V');
});
