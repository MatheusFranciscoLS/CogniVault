import test from 'node:test';
import assert from 'node:assert/strict';
import { husqvarnaArticleId, husqvarnaArticleIdCandidates } from './husqvarna-article-id';

test('número de artigo do portal tem 9 dígitos; etiqueta longa é truncada', () => {
  // Medido contra a API real: o de 9 responde, o de 11 devolve null.
  assert.deepEqual(husqvarnaArticleIdCandidates('96041044000'), ['960410440', '96041044000']);
  assert.deepEqual(husqvarnaArticleIdCandidates('96041043000'), ['960410430', '96041043000']);
  assert.equal(husqvarnaArticleId('96041044000'), '960410440');

  // Já com 9 dígitos, nada a fazer — é o caso da 143R II e das motosserras.
  assert.deepEqual(husqvarnaArticleIdCandidates('967332904'), ['967332904']);
  assert.equal(husqvarnaArticleId('967332904'), '967332904');
});

test('aceita a etiqueta como o balcão digita, com espaço e hífen', () => {
  assert.equal(husqvarnaArticleId('967 33 29-04'), '967332904');
  assert.equal(husqvarnaArticleId('960 41 044-000'), '960410440');
});

test('abaixo de 9 dígitos não inventa o que falta', () => {
  // Completar com zero consultaria o artigo de OUTRA máquina. Melhor devolver
  // como veio e deixar a API recusar.
  assert.deepEqual(husqvarnaArticleIdCandidates('9673329'), ['9673329']);
  assert.equal(husqvarnaArticleId('9673329'), null);
});

test('entrada sem dígito não gera candidato', () => {
  assert.deepEqual(husqvarnaArticleIdCandidates(''), []);
  assert.deepEqual(husqvarnaArticleIdCandidates('abc'), []);
  assert.deepEqual(husqvarnaArticleIdCandidates('---'), []);
  assert.equal(husqvarnaArticleId('abc'), null);
});

test('candidatos nunca repetem e o prefixo vem primeiro', () => {
  const candidatos = husqvarnaArticleIdCandidates('960410440000');
  assert.equal(candidatos[0], '960410440');
  assert.equal(new Set(candidatos).size, candidatos.length);
});
