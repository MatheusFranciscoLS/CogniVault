import assert from 'node:assert/strict';
import test from 'node:test';
import { describePartNumberRejection, isPlausiblePartNumber } from './part-number';

/**
 * O risco que esta regra cobre, nas palavras do dono: a IA não ter certeza do
 * código e mandar qualquer um. O erro clássico da leitura visual é ler a coluna
 * KEY/REF (posição) ou a quantidade como se fosse o código da peça.
 *
 * O outro lado do risco é ser rígido demais e derrubar peça legítima: o
 * catálogo tem Husqvarna, Briggs & Stratton, Kawasaki e Kohler, com formatos
 * diferentes. Os casos abaixo vêm de códigos reais usados no benchmark e nos
 * testes de saúde do catálogo.
 */

test('aceita código Husqvarna real, com e sem formatação', () => {
  for (const code of ['589832901', '594090301', '587106701', '505296901', '510917901', '503980003']) {
    assert.equal(isPlausiblePartNumber(code), true, `rejeitou Husqvarna real: ${code}`);
  }
  assert.equal(isPlausiblePartNumber('505 30 00-01'), true);
  assert.equal(isPlausiblePartNumber('115 63 62-96'), true);
});

test('aceita código de motor Briggs de 5 e 6 dígitos', () => {
  // De catalog-health.test.ts: catálogo Briggs real com códigos de 5 dígitos.
  for (const code of ['27911', '69185', '94695', '49768', '794653']) {
    assert.equal(isPlausiblePartNumber(code), true, `rejeitou Briggs real: ${code}`);
  }
});

test('aceita código com letra e hífen de outras marcas', () => {
  assert.equal(isPlausiblePartNumber('11061-7033'), true);
  assert.equal(isPlausiblePartNumber('12J900-0000'), true);
});

test('rejeita posição lida como código — o erro caro', () => {
  // Posição no IPL é 1 a 3 dígitos. Nenhuma delas é código de peça.
  for (const position of ['1', '7', '17', '100', '12A', '9']) {
    assert.equal(isPlausiblePartNumber(position), false, `aceitou posição como código: ${position}`);
  }
});

test('rejeita quantidade e sobras de leitura', () => {
  for (const value of ['', '  ', '-', '--', 'x', '2x', null, undefined]) {
    assert.equal(isPlausiblePartNumber(value), false, `aceitou lixo: ${String(value)}`);
  }
});

test('rejeita texto sem dígitos suficientes para ser código', () => {
  assert.equal(isPlausiblePartNumber('PARAFUSO'), false);
  assert.equal(isPlausiblePartNumber('KIT'), false);
  assert.equal(isPlausiblePartNumber('AB1'), false);
});

test('rejeita código absurdamente longo', () => {
  assert.equal(isPlausiblePartNumber('1'.repeat(19)), false);
  assert.equal(isPlausiblePartNumber('1'.repeat(18)), true);
});

test('o motivo da recusa explica o caso perigoso em português', () => {
  assert.match(describePartNumberRejection('17'), /posição ou quantidade/i);
  assert.match(describePartNumberRejection(''), /vazio/i);
  assert.match(describePartNumberRejection('1'.repeat(19)), /longo/i);
  assert.match(describePartNumberRejection('AB1X'), /dígitos/i);
});
