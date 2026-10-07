import assert from 'node:assert/strict';
import test from 'node:test';
import { parseQuoteOptions } from './quote.service';

// Prazo e observações do orçamento (2026-10-07): o prazo das peças é digitado à mão em cada orçamento porque depende do
// estoque; as observações têm texto padrão da loja e podem ser editadas.

test('o prazo das peças e as observações passam, sem espaço nas pontas', () => {
  const options = parseQuoteOptions({ leadTime: '  7 dias úteis ', notes: '  Frete por conta do cliente  ' });
  assert.equal(options?.leadTime, '7 dias úteis');
  assert.equal(options?.notes, 'Frete por conta do cliente');
});

test('vazio ou sem o campo vira nulo: a loja volta ao padrão do modelo (IMEDIATO e as 3 observações)', () => {
  assert.equal(parseQuoteOptions({ leadTime: '   ', notes: '' })?.leadTime, null);
  assert.equal(parseQuoteOptions({ leadTime: '   ', notes: '' })?.notes, null);
  assert.equal(parseQuoteOptions({})?.leadTime, null);
  assert.equal(parseQuoteOptions(null)?.leadTime, undefined);
});

test('o prazo tem teto de 120 caracteres e as observações de 2000, e tipo errado é ignorado', () => {
  assert.equal(parseQuoteOptions({ leadTime: 'x'.repeat(500) })?.leadTime?.length, 120);
  assert.equal(parseQuoteOptions({ notes: 'y'.repeat(5000) })?.notes?.length, 2000);
  assert.equal(parseQuoteOptions({ leadTime: 7 })?.leadTime, null);
});
