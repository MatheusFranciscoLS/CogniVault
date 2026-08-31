import assert from 'node:assert/strict';
import test from 'node:test';
import { isVisualQuotaFailure } from '../utils/visual-catalog-retry-policy';

test('reconhece somente falha de cota ligada à leitura visual do PDF', () => {
  assert.equal(isVisualQuotaFailure('Este PDF precisa de leitura visual pela IA. A cota diária do modelo foi atingida.'), true);
  assert.equal(isVisualQuotaFailure('Gemini quota atingida durante leitura do PDF visual.'), true);
  assert.equal(isVisualQuotaFailure('Storage indisponível.'), false);
  assert.equal(isVisualQuotaFailure(null), false);
});
