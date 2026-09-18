import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fuzzyNormalizePartCode,
  generateAdjacentKeyVariations,
  generateDeduplicationVariations,
  generateInsertionVariations,
  generateTranspositionVariations,
  stripLeadingZeros,
  stripToAlphanumeric,
} from './fuzzy-code';

test('stripToAlphanumeric remove espaços, hífens, pontos e barras', () => {
  assert.equal(stripToAlphanumeric('537 04 19-01'), '537041901');
  assert.equal(stripToAlphanumeric('537.04.19.01'), '537041901');
  assert.equal(stripToAlphanumeric('537/041901'), '537041901');
});

test('stripLeadingZeros só age em código puramente numérico com mais de 3 dígitos', () => {
  assert.equal(stripLeadingZeros('0537041901'), '537041901');
  assert.equal(stripLeadingZeros('012'), '012'); // curto demais, não mexe
  assert.equal(stripLeadingZeros('ABC0123'), 'ABC0123'); // não é só dígito
});

test('generateTranspositionVariations troca cada par de dígitos adjacentes diferentes', () => {
  const variations = generateTranspositionVariations('537049101');
  assert.ok(variations.includes('537041901'), 'deveria conter a versão com 9 e 1 trocados');
  assert.ok(!variations.includes('537049101'), 'não deve incluir o próprio código original');
});

test('generateAdjacentKeyVariations só roda em código numérico de 5 a 15 dígitos', () => {
  assert.deepEqual(generateAdjacentKeyVariations('123'), []); // curto demais
  assert.deepEqual(generateAdjacentKeyVariations('ABC1234567'), []); // não numérico
  const variations = generateAdjacentKeyVariations('537041901');
  assert.ok(variations.length > 0);
  assert.ok(variations.every(v => v.length === 9));
});

test('generateDeduplicationVariations remove uma ocorrência de dígito duplicado', () => {
  const variations = generateDeduplicationVariations('5370441901');
  assert.ok(variations.includes('537041901'), 'deveria remover um dos 4 duplicados');
});

test('generateInsertionVariations só roda em código de 7 ou 8 dígitos (Husqvarna usa 9)', () => {
  assert.deepEqual(generateInsertionVariations('123456'), []); // curto demais
  assert.deepEqual(generateInsertionVariations('1234567890'), []); // longo demais
  const variations = generateInsertionVariations('53704190'); // 8 dígitos, falta 1
  assert.ok(variations.includes('537041901'), 'inserir 1 no fim deveria reconstituir o código de 9 dígitos');
});

test('fuzzyNormalizePartCode: código digitado certo não gera variações desnecessárias além do esperado', () => {
  const result = fuzzyNormalizePartCode('537041901');
  assert.equal(result.primary, '537041901');
  assert.equal(result.hadSeparators, false);
  assert.ok(result.fuzzyVariations.length <= 50, 'respeita o teto de segurança');
});

test('fuzzyNormalizePartCode: código com separadores e zero à esquerda normaliza certo', () => {
  const result = fuzzyNormalizePartCode('0537-04-19-01');
  assert.equal(result.hadSeparators, true);
  // stripLeadingZeros roda sobre o stripped ("053704190" + "1" = "0537041901"),
  // então a variação sem zero à esquerda deve aparecer entre as sugestões.
  assert.ok(result.fuzzyVariations.some(v => !v.startsWith('0')));
});

test('fuzzyNormalizePartCode nunca inclui o próprio código normalizado nas variações', () => {
  const result = fuzzyNormalizePartCode('587106701');
  assert.ok(!result.fuzzyVariations.includes(result.primary));
});
