import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFallbackIntent,
  extractLikelyModel,
  extractLikelyPartNumber,
  extractLikelyPnc,
} from './chat-reliability';
test('serial e PNC contínuo não são tratados como Part Number e não escondem o modelo', () => {
  const question = 'adaptador da lâmina LB256SP PNC: 970488501 S/N 20240200001';
  assert.equal(extractLikelyPartNumber(question), '');
  assert.equal(extractLikelyPnc(question), '970488501');
  assert.equal(extractLikelyModel(question).toUpperCase(), 'LB256SP');
  const intent = buildFallbackIntent(question);
  assert.equal(intent.partNumber, '');
  assert.equal(intent.pnc, '970488501');
  assert.equal(intent.model.toUpperCase(), 'LB256SP');
});
