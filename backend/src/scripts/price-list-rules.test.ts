import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMERCIAL_MARKUP_PERCENT, COMMERCIAL_PRICE_DIVISOR, commercialPrice } from './price-list-rules';

test('regra comercial aplica exatamente 5% sobre o valor da planilha', () => {
  assert.equal(COMMERCIAL_MARKUP_PERCENT, 5);
  // Preso ao valor exato, não só à fórmula: já existiu um divisor (0.92) que
  // parecia certo de olho mas resultava em +8,7% em vez dos +5% combinados
  // com o proprietário. Esse teste trava o número, não só a conta.
  assert.equal(COMMERCIAL_PRICE_DIVISOR.toFixed(6), '0.952381');
});

test('commercialPrice soma 5% e arredonda em 2 casas', () => {
  assert.equal(commercialPrice(100), 105);
  assert.equal(commercialPrice(199.9), 209.9);
  assert.equal(commercialPrice(0), 0);
  assert.equal(commercialPrice(null), null);
});
