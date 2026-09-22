import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, parseQuoteItems } from './quote.service';

test('preserva o fabricante do item no contrato do orçamento', () => {
  const items = parseQuoteItems([{
    partNumber: '15004-0937',
    manufacturer: 'Kawasaki',
    name: 'Junta',
    model: 'FX921V-ES06',
    quantity: 1,
    unitPrice: 12.5,
  }]);

  assert.equal(items?.[0]?.manufacturer, 'Kawasaki');
  assert.equal(items?.[0]?.partNumber, '15004-0937');
});

test('rejeita preço não finito e mantém total calculado no servidor', () => {
  assert.equal(parseQuoteItems([{
    partNumber: '592358',
    manufacturer: 'Briggs & Stratton',
    name: 'Gasket',
    quantity: 1,
    unitPrice: 'NaN',
  }]), null);

  const items = parseQuoteItems([{
    partNumber: '592358',
    manufacturer: 'Briggs & Stratton',
    name: 'Gasket',
    quantity: 2,
    unitPrice: 10.005,
  }]);
  assert.ok(items);
  assert.deepEqual(computeTotals(items, 10), {
    totalItems: 2,
    grossTotal: 20.02,
    discountAmount: 2,
    netTotal: 18.02,
  });
});
