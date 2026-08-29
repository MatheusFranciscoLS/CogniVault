import assert from 'node:assert/strict';
import test from 'node:test';
import { filterCandidatesByMarket } from './catalog-market';
import { focusCandidatesByDescription } from './part-vocabulary';
import { preferCurrentPartNumbers } from './part-supersession';

test('143RII: pedido de embreagem completa prioriza a peça EMBRAIAGEM, não componentes da mesma vista', () => {
  const candidates = [
    { id: 'clutch', name: 'EMBRAIAGEM', section: '143RII CLUTCH', alternativeNames: [], notes: null },
    { id: 'spring', name: 'MOLA', section: '143RII CLUTCH', alternativeNames: [], notes: null },
    { id: 'drum', name: 'TAMBOR', section: '143RII CLUTCH', alternativeNames: [], notes: null },
    { id: 'screw', name: 'PARAFUSO', section: '143RII CLUTCH', alternativeNames: [], notes: null },
  ];

  const focused = focusCandidatesByDescription('Qual o código da embreagem completa da 143RII?', candidates);
  assert.deepEqual(focused.map(candidate => candidate.id), ['clutch']);
});

test('143RII: mercado Latin America + substituição oficial mantém somente o carburador atual', () => {
  const candidates = [
    { id: 'latam-old', partNumber: '586931401', normalizedPartNumber: '586931401', notes: 'ASIA, Latin America' },
    { id: 'latam-current', partNumber: '587106701', normalizedPartNumber: '587106701', notes: 'ASIA, Latin America' },
    { id: 'eu-a', partNumber: '528753801', normalizedPartNumber: '528753801', notes: 'EU' },
    { id: 'eu-b', partNumber: '587822501', normalizedPartNumber: '587822501', notes: 'EU' },
  ];

  const marketCompatible = filterCandidatesByMarket(candidates, 'Latin America');
  const current = preferCurrentPartNumbers(marketCompatible);

  assert.deepEqual(current.map(candidate => candidate.id), ['latam-current']);
  assert.equal(current[0].partNumber, '587106701');
});
