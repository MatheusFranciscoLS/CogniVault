import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMERCIAL_PRICE_DIVISOR, commercialPrice } from './price-list-rules';

test('regra comercial usa o divisor confirmado com o Portal Parceiro Husqvarna', () => {
  // Preso ao valor exato, não só à fórmula: já existiu uma "correção" que
  // trocou este número por engano, achando que a base era outra. O valor
  // certo só se confirma de novo com print do parceirohusqvarna.com.
  assert.equal(COMMERCIAL_PRICE_DIVISOR, 0.92);
});

test('commercialPrice reproduz o exemplo real conferido (PREÇO CONSUMIDOR R$ 22,00 → R$ 23,91)', () => {
  assert.equal(commercialPrice(22), 23.91);
  assert.equal(commercialPrice(0), 0);
  assert.equal(commercialPrice(null), null);
});
