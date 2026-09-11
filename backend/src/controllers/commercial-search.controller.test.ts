import assert from 'node:assert/strict';
import test from 'node:test';
import {
  commercialCodePrefixUpperBound,
  looksLikeCommercialCodePrefix,
} from './commercial-search.controller';

test('detecta Part Number numérico parcial sem confundir modelos curtos', () => {
  assert.equal(looksLikeCommercialCodePrefix('58710'), true);
  assert.equal(looksLikeCommercialCodePrefix('587 10 67'), true);
  assert.equal(looksLikeCommercialCodePrefix('MZ54'), false);
  assert.equal(looksLikeCommercialCodePrefix('K770'), false);
  assert.equal(looksLikeCommercialCodePrefix('filtro'), false);
});

test('aceita códigos alfanuméricos longos quando a maior parte é numérica', () => {
  assert.equal(looksLikeCommercialCodePrefix('12345A7'), true);
  assert.equal(looksLikeCommercialCodePrefix('ABC12345'), false);
});

test('gera limite superior exclusivo para busca por range no índice btree', () => {
  assert.equal(commercialCodePrefixUpperBound('58710'), '58711');
  assert.equal(commercialCodePrefixUpperBound('ABC99'), 'ABC9:');
});
