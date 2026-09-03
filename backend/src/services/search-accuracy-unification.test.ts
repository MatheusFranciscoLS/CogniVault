import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allRelatedPartNumbers,
  getVerifiedSupersession,
  getSupersededByCurrentNumber,
  preferCurrentPartNumbers,
} from './part-supersession';
import { filterCandidatesByMarket } from './catalog-market';

test('expande códigos bidirecionalmente para peças com substituição oficial', () => {
  const fromPrevious = allRelatedPartNumbers('586931401');
  assert.ok(fromPrevious.includes('586931401'));
  assert.ok(fromPrevious.includes('587106701'));

  const fromCurrent = allRelatedPartNumbers('587106701');
  assert.ok(fromCurrent.includes('587106701'));
  assert.ok(fromCurrent.includes('586931401'));

  const standalone = allRelatedPartNumbers('503281504');
  assert.deepEqual(standalone, ['503281504']);
});

test('identifica substituição oficial por código anterior e por código vigente', () => {
  const forward = getVerifiedSupersession('586931401');
  assert.ok(forward);
  assert.equal(forward?.currentPartNumber, '587106701');

  const backward = getSupersededByCurrentNumber('587106701');
  assert.ok(backward);
  assert.equal(backward?.previousPartNumber, '586931401');
});

test('atualiza automaticamente código do catálogo legado para código atual com nota oficial', () => {
  const legacyRow = {
    id: 'carb-legacy',
    name: 'CARBURADOR',
    model: '143RII',
    normalizedModel: '143rii',
    partNumber: '586931401',
    normalizedPartNumber: '586931401',
    notes: 'ASIA, Latin America',
  };

  const resolved = preferCurrentPartNumbers([legacyRow]);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].partNumber, '587106701');
  assert.equal(resolved[0].normalizedPartNumber, '587106701');
  assert.ok(resolved[0].notes?.includes('Substituição oficial: 586931401 → 587106701'));
  assert.ok(resolved[0].notes?.includes('ASIA, Latin America'));
});

test('remove variante europeia conflitante mantendo a variante da América Latina para 143RII', () => {
  const candidates = [
    {
      id: 'carb-eu',
      name: 'CARBURADOR',
      model: '143RII',
      normalizedModel: '143rii',
      partNumber: '587822501',
      normalizedPartNumber: '587822501',
      page: 28,
      position: '1',
      section: 'CARBURETOR',
      notes: 'EU',
    },
    {
      id: 'carb-latam',
      name: 'CARBURADOR',
      model: '143RII',
      normalizedModel: '143rii',
      partNumber: '586931401',
      normalizedPartNumber: '586931401',
      page: 29,
      position: '15',
      section: 'CARBURETTOR & AIR FILTER',
      notes: 'ASIA, Latin America',
    },
  ];

  const marketFiltered = filterCandidatesByMarket(candidates, 'LATIN_AMERICA');
  assert.equal(marketFiltered.length, 1);
  assert.equal(marketFiltered[0].id, 'carb-latam');

  const finalParts = preferCurrentPartNumbers(marketFiltered);
  assert.equal(finalParts.length, 1);
  assert.equal(finalParts[0].partNumber, '587106701');
  assert.ok(finalParts[0].notes?.includes('587106701'));
});

test('unificação: tanto busca direta quanto busca textual resultam no código oficial 587106701', () => {
  // Simula peças cadastradas no banco de dados para a 143RII
  const dbParts = [
    {
      id: 'p1',
      name: 'CARBURADOR',
      model: '143RII',
      normalizedModel: '143rii',
      partNumber: '586931401',
      normalizedPartNumber: '586931401',
      notes: 'ASIA, Latin America',
      universalAcrossPnc: true,
      pnc: null,
      page: 29,
      section: 'CARBURETTOR',
      position: '15',
    },
    {
      id: 'p2',
      name: 'CARBURADOR',
      model: '143RII',
      normalizedModel: '143rii',
      partNumber: '587822501',
      normalizedPartNumber: '587822501',
      notes: 'EU',
      universalAcrossPnc: true,
      pnc: null,
      page: 28,
      section: 'CARBURETOR EU',
      position: '1',
    },
  ];

  // Cenário A: Usuário busca pelo código atualizado "587106701"
  const userSearchCode = '587106701';
  const relatedSearchCodes = allRelatedPartNumbers(userSearchCode);
  const matchedRowsByCode = dbParts.filter(p => relatedSearchCodes.includes(p.partNumber));
  const unifiedResultByCode = preferCurrentPartNumbers(filterCandidatesByMarket(matchedRowsByCode));

  assert.equal(unifiedResultByCode.length, 1);
  assert.equal(unifiedResultByCode[0].partNumber, '587106701');

  // Cenário B: Usuário busca pelo nome "carburador 143rii"
  const matchedRowsByName = dbParts.filter(p => p.normalizedModel === '143rii');
  const unifiedResultByName = preferCurrentPartNumbers(filterCandidatesByMarket(matchedRowsByName));

  assert.equal(unifiedResultByName.length, 1);
  assert.equal(unifiedResultByName[0].partNumber, '587106701');
  assert.equal(unifiedResultByName[0].id, unifiedResultByCode[0].id);
});
