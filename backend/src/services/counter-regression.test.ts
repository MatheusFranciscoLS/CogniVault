import assert from 'node:assert/strict';
import test from 'node:test';
import { filterCandidatesByMarket } from './catalog-market';
import { findPartConcepts, focusCandidatesByDescription, scorePartText } from './part-vocabulary';
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

test('Dicionário de Jargões de Balcão reconhece linguagem coloquial de mecânico', () => {
  // Frente 1: Aliases e jargões essenciais de balcão
  assert.ok(findPartConcepts('cordinha de puxar').some((c: { key: string }) => c.key === 'starter-rope'), 'cordinha de puxar -> starter-rope');
  assert.ok(findPartConcepts('cebolinha do carburador').some((c: { key: string }) => c.key === 'air-purge'), 'cebolinha -> air-purge');
  assert.ok(findPartConcepts('pera injetora').some((c: { key: string }) => c.key === 'air-purge'), 'pera injetora -> air-purge');
  assert.ok(findPartConcepts('tampa da cordinha').some((c: { key: string }) => c.key === 'starter'), 'tampa da cordinha -> starter');
  assert.ok(findPartConcepts('caximbo da vela').some((c: { key: string }) => c.key === 'spark-plug-cap'), 'caximbo -> spark-plug-cap');
  assert.ok(findPartConcepts('caracol do soprador').some((c: { key: string }) => c.key === 'blower-volute'), 'caracol -> blower-volute');
  assert.ok(findPartConcepts('copinho da lamina').some((c: { key: string }) => c.key === 'blade-cup'), 'copinho -> blade-cup');
  assert.ok(findPartConcepts('kit reparo carburador').some((c: { key: string }) => c.key === 'diaphragm'), 'kit reparo carburador -> diaphragm');
  assert.ok(findPartConcepts('flange dentada').some((c: { key: string }) => c.key === 'blade-flange'), 'flange dentada -> blade-flange');
  assert.ok(findPartConcepts('esticador da corrente').some((c: { key: string }) => c.key === 'chain-tensioner'), 'esticador da corrente -> chain-tensioner');

  // Ranking com jargões pontua a peça técnica correta acima de peças genéricas
  const cordScore = scorePartText('cordinha de puxar 143RII', { name: 'STARTER CORD 3.5MM', section: 'STARTER' });
  const screwScore = scorePartText('cordinha de puxar 143RII', { name: 'SCREW', section: 'STARTER' });
  assert.ok(cordScore > screwScore + 0.5, 'Corda de arranque deve superar parafuso ao buscar cordinha de puxar');

  const purgeScore = scorePartText('cebolinha da 143RII', { name: 'PURGE PUMP ASSY', section: 'CARBURETOR' });
  assert.ok(purgeScore > 0.8, 'Cebolinha deve reconhecer purge pump com alta pontuação');

  const starterScore = scorePartText('tampa da cordinha 143RII', { name: 'RECOIL STARTER ASSY', section: 'STARTER' });
  assert.ok(starterScore > 0.8, 'Tampa da cordinha deve reconhecer recoil starter assy');

  const capScore = scorePartText('caximbo da vela 550XP', { name: 'SPARK PLUG CAP', section: 'IGNITION' });
  assert.ok(capScore > 0.8, 'Caximbo da vela deve pontuar alto para spark plug cap');
});
