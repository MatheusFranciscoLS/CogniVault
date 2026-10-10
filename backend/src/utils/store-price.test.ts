import assert from 'node:assert/strict';
import test from 'node:test';
import { storePrice } from './store-price';

test('preço maior que zero passa como está', () => {
  assert.equal(storePrice(378.26), 378.26);
  assert.equal(storePrice(0.12), 0.12);
  assert.equal(storePrice(60525), 60525);
});

test('R$ 0,00 é "sem preço", não um valor', () => {
  assert.equal(storePrice(0), null);
  assert.equal(storePrice(-0), null);
});

test('negativo, vazio e lixo numérico também são "sem preço"', () => {
  assert.equal(storePrice(-5), null);
  assert.equal(storePrice(null), null);
  assert.equal(storePrice(undefined), null);
  assert.equal(storePrice(Number.NaN), null);
  assert.equal(storePrice(Number.POSITIVE_INFINITY), null);
  assert.equal(storePrice('12' as unknown as number), null);
});
