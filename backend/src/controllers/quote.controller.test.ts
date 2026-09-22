import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessQuote } from './quote.controller';

test('admin pode acessar qualquer orçamento do tenant', () => {
  assert.equal(canAccessQuote('ADMIN', 'admin-1', 'attendant-1'), true);
  assert.equal(canAccessQuote('ADMIN', 'admin-1', null), true);
});

test('atendente pode acessar somente o próprio orçamento', () => {
  assert.equal(canAccessQuote('MECHANIC', 'attendant-1', 'attendant-1'), true);
  assert.equal(canAccessQuote('MECHANIC', 'attendant-1', 'attendant-2'), false);
});

test('orçamento órfão não fica acessível para atendente', () => {
  assert.equal(canAccessQuote('MECHANIC', 'attendant-1', null), false);
});
