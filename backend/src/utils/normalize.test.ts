import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeIdentifier, normalizeText } from './normalize';
import { findPartConcepts } from '../services/part-vocabulary';

// Estas duas funções guardam o resultado (rodam milhares de vezes por busca descritiva: ver o comentário em
// normalize.ts). O que importa aqui é que guardar NÃO muda a resposta de ninguém.

test('normalizeText: tira acento, baixa a caixa e junta espaços, igual antes de guardar o resultado', () => {
  assert.equal(normalizeText('  Vela   de  IGNIÇÃO '), 'vela de ignicao');
  assert.equal(normalizeText('Abraçadeira'), 'abracadeira');
  assert.equal(normalizeText(''), '');
  assert.equal(normalizeText(null), '');
  assert.equal(normalizeText(undefined), '');
});

test('normalizeIdentifier: só letras e números em maiúsculas', () => {
  assert.equal(normalizeIdentifier('587 10 67-01'), '587106701');
  assert.equal(normalizeIdentifier('104M02-0002-F1'), '104M020002F1');
  assert.equal(normalizeIdentifier(null), '');
});

test('chamar de novo com o mesmo texto devolve o mesmo valor (resposta guardada)', () => {
  const primeira = normalizeText('Junta do Carburador');
  const segunda = normalizeText('Junta do Carburador');
  assert.equal(primeira, 'junta do carburador');
  assert.equal(segunda, primeira);
});

test('texto muito longo não é guardado e continua correto', () => {
  const longo = `Á${'a '.repeat(400)}`;
  // "Á" vira "a" e cola na primeira letra do texto; as 399 repetições restantes ficam separadas por espaço.
  assert.equal(normalizeText(longo), `aa${' a'.repeat(399)}`);
  assert.equal(normalizeText(longo), normalizeText(longo));
});

test('a memória tem teto: passar do limite não quebra nem muda resultado', () => {
  for (let i = 0; i < 31_000; i += 1) normalizeText(`Peça número ${i}`);
  assert.equal(normalizeText('Peça número 7'), 'peca numero 7');
  assert.equal(normalizeText('Peça número 30999'), 'peca numero 30999');
});

test('vocabulário preparado: as mesmas consultas continuam achando os mesmos conceitos, na mesma ordem', () => {
  const chaves = (texto: string) => findPartConcepts(texto).map(grupo => grupo.key);
  assert.ok(chaves('junta do carburador').includes('gasket'));
  assert.ok(chaves('junta do carburador').length >= 2, 'junta e carburador são dois conceitos');
  assert.deepEqual(chaves('junta do carburador'), chaves('junta do carburador'));
  assert.ok(chaves('vela de ignição').length > 0);
  assert.deepEqual(chaves('zzzqqq xyz'), []);
  // cada chamada devolve grupos próprios: quem recebe pode mexer sem estragar a próxima consulta
  const a = findPartConcepts('filtro de ar');
  const b = findPartConcepts('filtro de ar');
  assert.notStrictEqual(a[0]?.variants, b[0]?.variants);
  assert.deepEqual(a, b);
});
