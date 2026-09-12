import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOfficialProductDetails, parseOfficialProductEquipment } from './husqvarna-official-detail.service';

// Official BR API, PNC 967983916, inspected 2026-09-12.
const battery = { id: 'PT1966', formattedValue: '--', specificationDefinitions: { name: 'Nome do modelo da bateria' } };
const charger = { id: 'PT1968', formattedValue: '--', specificationDefinitions: { name: 'Nome do modelo do carregador de bateria' } };
const chain = { id: 'PT59', formattedValue: 'SP21G', specificationDefinitions: { name: 'Tipo de corrente' } };

test('explicit notIncluded entries remain exclusions even with placeholder values', () => {
  assert.deepEqual(parseOfficialProductEquipment({ included: [chain], notIncluded: [battery, charger] }), {
    included: [{ id: 'PT59', name: 'Tipo de corrente', value: 'SP21G' }],
    notIncluded: [
      { id: 'PT1966', name: 'Nome do modelo da bateria', value: null },
      { id: 'PT1968', name: 'Nome do modelo do carregador de bateria', value: null },
    ],
  });
});

test('unknown equipment is distinct from an explicit empty list', () => {
  assert.equal(parseOfficialProductEquipment({}), null);
  assert.equal(parseOfficialProductEquipment({ included: {}, notIncluded: null }), null);
  assert.deepEqual(parseOfficialProductEquipment({ included: [], notIncluded: [] }), { included: [], notIncluded: [] });
});

test('malformed, duplicate and contradictory equipment cannot become sales assertions', () => {
  assert.deepEqual(parseOfficialProductEquipment({
    included: [chain, null, {}, chain, battery],
    notIncluded: [battery, charger, charger, { id: 'invalid', specificationDefinitions: { name: {} } }],
  }), {
    included: [{ id: 'PT59', name: 'Tipo de corrente', value: 'SP21G' }],
    notIncluded: [{ id: 'PT1968', name: 'Nome do modelo do carregador de bateria', value: null }],
  });
});

test('equipment is scoped to the exact requested PNC, never to another variant or product title', () => {
  const payload = { site: { articles: { byIds: [
    { id: '967983916', name: { productName: '540i XP' }, included: [], notIncluded: [battery, charger] },
    { id: '970666516', name: { productName: '542i XP' }, included: [chain], notIncluded: [] },
  ] } } };
  assert.equal(parseOfficialProductDetails(payload, '967983916')?.equipment?.notIncluded.length, 2);
  assert.equal(parseOfficialProductDetails(payload, '970666516')?.equipment?.notIncluded.length, 0);
  assert.equal(parseOfficialProductDetails(payload, '111111111'), null);
  const missing = { site: { articles: { byIds: [{ id: '967983916', name: { productName: '540i XP sem bateria' } }] } } };
  assert.equal(parseOfficialProductDetails(missing, '967983916')?.equipment, null);
});
