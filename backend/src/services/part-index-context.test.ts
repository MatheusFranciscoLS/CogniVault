import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPartRetrievalContext } from './part-index-context';

test('contextualiza parafuso genérico pela vista da embreagem sem alterar dado oficial', () => {
  const context = buildPartRetrievalContext({
    manufacturer: 'Husqvarna',
    model: '321S25',
    section: 'CLUTCH',
    position: '16',
    name: 'SCREW',
    alternativeNames: ['Clutch screw'],
    partNumber: '589539801',
  });

  assert.equal(context.family, 'POWER_SPRAYER');
  assert.match(context.searchText, /Peça oficial do catálogo: SCREW/);
  assert.match(context.searchText, /Part Number oficial: 589539801/);
  assert.match(context.searchText, /embreagem/i);
  assert.match(context.searchText, /parafuso/i);
  assert.equal(context.searchText.includes('599764701'), false);
});

test('adiciona linguagem de balcão do soprador somente como termo de recuperação', () => {
  const context = buildPartRetrievalContext({
    manufacturer: 'Husqvarna',
    model: '125B',
    section: 'FAN HOUSING',
    name: 'ASSEMBLY OUTER SCROLL',
    partNumber: '575533201',
  });

  assert.equal(context.family, 'BLOWER');
  assert.ok(context.inferredAliases.includes('caracol'));
  assert.match(context.searchText, /Termos inferidos somente para recuperação:/);
  assert.match(context.searchText, /caracol/);
});

test('lâmina de cortador não recebe sabre de motosserra por contexto global', () => {
  const context = buildPartRetrievalContext({
    manufacturer: 'Husqvarna',
    model: 'LC151S',
    section: 'CUTTING EQUIPMENT',
    name: 'BLADE',
    partNumber: '000000001',
  });

  assert.equal(context.family, 'WALK_MOWER');
  assert.equal(context.inferredAliases.includes('sabre'), false);
  assert.equal(context.inferredAliases.includes('guide bar'), false);
});

test('preserva escopo PNC explícito no contexto de recuperação', () => {
  const scoped = buildPartRetrievalContext({
    model: 'TS142',
    pnc: '96041043000',
    section: 'ENGINE',
    name: 'ENGINE',
    partNumber: '593230101',
  });
  assert.match(scoped.searchText, /PNC: 96041043000/);

  const universal = buildPartRetrievalContext({
    model: '525P5S',
    universalAcrossPnc: true,
    name: 'SCREW',
    partNumber: '504114301',
  });
  assert.match(universal.searchText, /explicitamente universal/);
});
