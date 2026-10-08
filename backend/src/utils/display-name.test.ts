import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDisplayName } from './display-name';

test('nome de pessoa é aceito e normalizado', () => {
  assert.deepEqual(parseDisplayName('Matheus Francisco'), { ok: true, value: 'Matheus Francisco' });
  assert.deepEqual(parseDisplayName('  Ana   Souza  '), { ok: true, value: 'Ana Souza' });
  assert.deepEqual(parseDisplayName("Joana D'Arc"), { ok: true, value: "Joana D'Arc" });
  assert.deepEqual(parseDisplayName('João Pedro Kuhl-Azevedo'), { ok: true, value: 'João Pedro Kuhl-Azevedo' });
  assert.deepEqual(parseDisplayName('José Silva'), { ok: true, value: 'José Silva' }); // acento decomposto vira um caractere só
});

test('vazio ou null limpa o nome', () => {
  assert.deepEqual(parseDisplayName(''), { ok: true, value: null });
  assert.deepEqual(parseDisplayName('   '), { ok: true, value: null });
  assert.deepEqual(parseDisplayName(null), { ok: true, value: null });
});

test('e-mail, número, símbolo, tamanho absurdo e tipo errado são recusados', () => {
  for (const ruim of ['matheus@loja.com', 'Atendente 2', 'Nome <b>', 'A', 'x'.repeat(81), '123', '-Matheus', 42, {}, ['Ana']]) {
    assert.deepEqual(parseDisplayName(ruim), { ok: false }, String(ruim));
  }
});
