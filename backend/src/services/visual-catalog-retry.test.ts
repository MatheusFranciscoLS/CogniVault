import assert from 'node:assert/strict';
import test from 'node:test';
import { isVisualQuotaFailure, normalizeVisualRetryLimit } from '../utils/visual-catalog-retry-policy';

test('reconhece somente falha de cota ligada à leitura visual do PDF', () => {
  assert.equal(isVisualQuotaFailure('Este PDF precisa de leitura visual pela IA. A cota diária do modelo foi atingida.'), true);
  assert.equal(isVisualQuotaFailure('Gemini quota atingida durante leitura do PDF visual.'), true);
  assert.equal(isVisualQuotaFailure('Storage indisponível.'), false);
  assert.equal(isVisualQuotaFailure(null), false);
});

test('limite da retentativa visual nunca vira NaN nem sai de um a três', () => {
  assert.equal(normalizeVisualRetryLimit(Number.NaN), 1);
  assert.equal(normalizeVisualRetryLimit(Number.POSITIVE_INFINITY), 1);
  assert.equal(normalizeVisualRetryLimit('x'), 1);
  assert.equal(normalizeVisualRetryLimit(-5), 1);
  assert.equal(normalizeVisualRetryLimit(1.9), 1);
  assert.equal(normalizeVisualRetryLimit('2'), 2);
  assert.equal(normalizeVisualRetryLimit(99), 3);
});
