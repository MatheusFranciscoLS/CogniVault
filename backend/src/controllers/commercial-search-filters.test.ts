import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommercialTextFilters, commercialSearchTokens, commercialSearchWords, wordForms } from './commercial-search.controller';

// A lista de preços da Husqvarna vem SEM acento ("VELA DE IGNICAO"). O balcão digita COM
// acento ("vela de ignição"). Estes testes travam que as duas formas procuram o mesmo.

function nameTerms(filters: ReturnType<typeof buildCommercialTextFilters>): string[] {
  return filters
    .map(filter => (filter as { name?: { contains?: string } }).name?.contains)
    .filter((term): term is string => typeof term === 'string');
}

test('pergunta com acento também procura a forma sem acento (a lista não tem acento)', () => {
  const terms = nameTerms(buildCommercialTextFilters('vela de ignição'));
  assert.ok(terms.includes('vela de ignição'), 'a forma digitada continua valendo');
  assert.ok(terms.includes('vela de ignicao'), 'a forma sem acento é a que existe na lista');
});

test('pergunta sem acento não duplica o filtro', () => {
  const terms = nameTerms(buildCommercialTextFilters('filtro'));
  assert.deepEqual(terms, ['filtro']);
});

test('as palavras vazias ("de", "para") e a repetição saem; o acento sai', () => {
  assert.deepEqual(commercialSearchTokens('vela de ignição para roçadeira roçadeira'), ['vela', 'ignicao', 'rocadeira']);
});

test('várias palavras aceitam a peça que tenha TODAS, em qualquer ordem', () => {
  const filters = buildCommercialTextFilters('filtro ar roçadeira');
  const and = filters.find(filter => 'AND' in filter) as { AND: unknown[] } | undefined;
  assert.ok(and, 'tem o ramo "todas as palavras"');
  assert.equal(and.AND.length, 3, 'uma exigência por palavra');
});

test('uma palavra só não cria o ramo "todas as palavras" (seria igual ao filtro simples)', () => {
  assert.equal(buildCommercialTextFilters('carburador').some(filter => 'AND' in filter), false);
});

test('"de ignição" sozinho não vira duas exigências de palavras vazias', () => {
  // "de" é descartada: sobra 1 palavra, então não há ramo AND.
  assert.equal(buildCommercialTextFilters('de ignição').some(filter => 'AND' in filter), false);
});

test('o número de palavras tem teto (a consulta sobe até 200 caracteres)', () => {
  const longa = Array.from({ length: 30 }, (_, index) => `palavra${index}`).join(' ');
  assert.equal(commercialSearchTokens(longa).length, 6);
  const and = buildCommercialTextFilters(longa).find(filter => 'AND' in filter) as { AND: unknown[] };
  assert.equal(and.AND.length, 6);
});

test('cada palavra é procurada em nome, descrição, marca e aplicação', () => {
  const and = buildCommercialTextFilters('vela roçadeira').find(filter => 'AND' in filter) as { AND: Array<{ OR: unknown[] }> };
  // "vela" tem uma forma só (4 campos); "roçadeira" tem duas, com e sem acento (8 campos).
  assert.equal(and.AND[0].OR.length, 4);
  assert.equal(and.AND[1].OR.length, 8);
});

test('a palavra é tentada COM acento: as categorias da lista vêm com ("ROÇADEIRA"), o nome vem sem', () => {
  const words = commercialSearchWords('filtro de ar roçadeira');
  assert.deepEqual(words.map(word => word.plain), ['filtro', 'ar', 'rocadeira']);
  assert.deepEqual(words[2].variants, ['roçadeira', 'rocadeira']);
  assert.deepEqual(words[0].variants, ['filtro']);
});

// A lista escreve "NAILON" e "BOMBA MANUAL"; o balcão fala "nylon" e "primer". Medido: a busca devolvia ZERO.
test('"nylon" também procura "nailon" e "nilon" (a lista escreve NAILON)', () => {
  const words = commercialSearchWords('fio de nylon');
  const nylon = words.find(word => word.plain === 'nylon');
  assert.ok(nylon);
  assert.ok(nylon.variants.includes('nylon') && nylon.variants.includes('nailon') && nylon.variants.includes('nilon'));
  const and = buildCommercialTextFilters('fio de nylon').find(filter => 'AND' in filter) as { AND: Array<{ OR: unknown[] }> };
  assert.equal(and.AND.length, 2, 'fio e nylon');
});

test('"primer" também procura "bomba manual"', () => {
  const primer = commercialSearchWords('bomba primer').find(word => word.plain === 'primer');
  assert.ok(primer?.variants.includes('bomba manual'));
});

test('uma palavra com equivalente (primer) gera filtros para as formas dela, não só a frase', () => {
  const terms = nameTerms(buildCommercialTextFilters('primer'));
  assert.ok(terms.includes('primer') && terms.includes('bomba manual'));
});

test('palavra sem equivalente não muda nada', () => {
  assert.deepEqual(wordForms('carburador'), ['carburador']);
  assert.deepEqual(nameTerms(buildCommercialTextFilters('filtro')), ['filtro']);
});
