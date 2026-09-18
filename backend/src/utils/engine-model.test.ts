import assert from 'node:assert/strict';
import test from 'node:test';
import { briggsManualsSearchUrl, engineModelVariants, formatBriggsModelForSearch } from './engine-model';

/**
 * Casos ancorados em modelos Briggs reais já presentes nesta base
 * (`12J900-0000`, `104M02-0002-F1`, `12J902-0118-01`) e no print da página
 * oficial da Briggs enviado pelo proprietário (`103M02-0027-H1`, cuja URL de
 * IPL aparece sem traço: `103M020027H1`).
 */

test('traço e espaço já convergem sozinhos — nenhuma variante extra é precisa', () => {
  const esperado = ['103M020027H1'];
  assert.deepEqual(engineModelVariants('103M02-0027-H1'), esperado);
  assert.deepEqual(engineModelVariants('103M02 0027 H1'), esperado);
  assert.deepEqual(engineModelVariants('103M020027H1'), esperado);
});

test('modelo de 5 dígitos ganha a forma com zero à esquerda', () => {
  const variantes = engineModelVariants('9D902-0027-H1');
  assert.ok(variantes.includes('9D9020027H1'), 'mantém a forma digitada');
  assert.ok(variantes.includes('09D9020027H1'), 'adiciona a forma do fabricante');
});

test('modelo gravado com zero também encontra quem digitou sem ele', () => {
  const variantes = engineModelVariants('09D902-0027-H1');
  assert.ok(variantes.includes('09D9020027H1'));
  assert.ok(variantes.includes('9D9020027H1'));
});

test('as duas direções chegam ao mesmo par — a busca encontra nos dois sentidos', () => {
  const comZero = new Set(engineModelVariants('09D9020027H1'));
  const semZero = new Set(engineModelVariants('9D9020027H1'));
  for (const variante of comZero) assert.ok(semZero.has(variante), `faltou ${variante} no sentido inverso`);
  for (const variante of semZero) assert.ok(comZero.has(variante), `faltou ${variante} no sentido direto`);
});

test('modelo sem código de 2 caracteres também funciona', () => {
  assert.deepEqual(engineModelVariants('12J900-0000'), ['12J9000000']);
  const variantes = engineModelVariants('2J900-0000');
  assert.ok(variantes.includes('2J9000000'));
  assert.ok(variantes.includes('02J9000000'));
});

test('modelo Husqvarna não é tocado — a regra é de motor, não de máquina', () => {
  for (const model of ['143RII', 'Z460', 'LC353AWD', '272XP', '125B', '525P5S', '321S25']) {
    const variantes = engineModelVariants(model);
    assert.equal(variantes.length, 1, `criou variante indevida para ${model}: ${variantes.join(', ')}`);
    assert.equal(variantes[0], model.toUpperCase());
  }
});

test('valor vazio não vira busca vazia', () => {
  for (const value of ['', '   ', null, undefined]) {
    assert.deepEqual(engineModelVariants(value), []);
  }
});

test('a variante extra nunca substitui a original', () => {
  // Garantia central: expandir só acrescenta. Se a forma digitada sumisse da
  // lista, a busca deixaria de achar o que já achava.
  for (const entrada of ['9D9020027H1', '09D9020027H1', '103M020027H1', '143RII']) {
    assert.ok(engineModelVariants(entrada).includes(entrada), `perdeu a forma original de ${entrada}`);
  }
});

// --- formatBriggsModelForSearch / briggsManualsSearchUrl ---
// Fonte da regra: página oficial "Find Your Manual or Parts List" da Briggs
// & Stratton, print do proprietário de 2026-09-18.

test('formata modelo de 6 dígitos com traço após os 6 primeiros caracteres', () => {
  assert.equal(formatBriggsModelForSearch('103M02-0027-H1'), '103M02-0027-H1');
  assert.equal(formatBriggsModelForSearch('103M020027H1'), '103M02-0027-H1');
  assert.equal(formatBriggsModelForSearch('104M02 0002 F1'), '104M02-0002-F1');
  assert.equal(formatBriggsModelForSearch('12J900-0000'), '12J900-0000');
});

test('modelo de 5 dígitos sempre ganha o zero à esquerda na saída, mesmo sem ele na entrada', () => {
  assert.equal(formatBriggsModelForSearch('9D902-0027-H1'), '09D902-0027-H1');
  assert.equal(formatBriggsModelForSearch('09D902-0027-H1'), '09D902-0027-H1');
});

test('aceita o texto guardado no catálogo, com prefixo e sufixo de máquina', () => {
  assert.equal(formatBriggsModelForSearch('Motor Briggs 104M02-0002-F1'), '104M02-0002-F1');
  assert.equal(formatBriggsModelForSearch('Motor Briggs 104M02-0002-F1 (Cortador LC121P)'), '104M02-0002-F1');
  assert.equal(formatBriggsModelForSearch('Motor Briggs & Stratton 12J900-0000'), '12J900-0000');
});

test('modelo Husqvarna (não Briggs) devolve null, nunca um link chutado', () => {
  for (const model of ['143RII', 'Z460', 'LC353AWD', 'LB155S', 'Motor Husqvarna HV764']) {
    assert.equal(formatBriggsModelForSearch(model), null, `formatou indevidamente: ${model}`);
  }
});

test('entrada vazia ou sem forma reconhecível devolve null', () => {
  for (const value of ['', '   ', null, undefined, 'Motor Briggs']) {
    assert.equal(formatBriggsModelForSearch(value), null);
  }
});

test('a URL de busca usa a forma canônica, codificada, no domínio oficial', () => {
  const url = briggsManualsSearchUrl('103M02-0027-H1');
  assert.ok(url);
  assert.equal(url, 'https://www.briggsandstratton.com/en-us/support/manuals/results?search=103M02-0027-H1');
  // A URL nunca deve conter o texto cru não formatado.
  assert.ok(!url!.includes('Motor'));
});

test('modelo que não é Briggs não gera URL nenhuma', () => {
  assert.equal(briggsManualsSearchUrl('143RII'), null);
  assert.equal(briggsManualsSearchUrl(''), null);
});
