import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyExplicitOccurrenceConstraints,
  extractExplicitOccurrencePosition,
  extractExplicitOccurrenceSection,
} from './explicit-occurrence-constraints';

test('extrai vista e posição somente quando o usuário as informa explicitamente', () => {
  assert.equal(extractExplicitOccurrencePosition('parafuso posição 16 na vista embreagem da 143RII'), '16');
  assert.equal(extractExplicitOccurrenceSection('parafuso posição 16 na vista embreagem da 143RII'), 'embreagem');
  assert.equal(extractExplicitOccurrenceSection('mola item 7 seção freio da corrente da 372 XP'), 'freio da corrente');
  assert.equal(extractExplicitOccurrenceSection('parafuso da embreagem da 143RII'), '');
});

test('vista traduzida e posição exata reduzem candidatos antes do ranking', () => {
  const candidates = [
    { id: 'clutch16', section: '143RII CLUTCH', position: '16' },
    { id: 'clutch13', section: '143RII CLUTCH', position: '13' },
    { id: 'carb16', section: '143RII CARBURETTOR', position: '16' },
  ];

  const filtered = applyExplicitOccurrenceConstraints(
    'parafuso posição 16 na vista embreagem da 143RII',
    candidates,
  );
  assert.deepEqual(filtered.map(item => item.id), ['clutch16']);
});

test('seção técnica funciona por conceito mesmo em outro idioma', () => {
  const candidates = [
    { id: 'brake', section: 'CHAIN BRAKE', position: '4' },
    { id: 'starter', section: 'STARTER', position: '4' },
  ];
  const filtered = applyExplicitOccurrenceConstraints('mola na seção freio da corrente', candidates);
  assert.deepEqual(filtered.map(item => item.id), ['brake']);
});

test('mantém candidatos quando a extração não comprova a restrição', () => {
  const candidates = [
    { id: 'a', section: null, position: null },
    { id: 'b', section: 'CLUTCH', position: '13' },
  ];
  assert.deepEqual(
    applyExplicitOccurrenceConstraints('parafuso posição 99 na vista transmissão', candidates),
    candidates,
  );
});

test('não força decisão quando seção e posição explícitas entram em conflito', () => {
  const candidates = [
    { id: 'clutch13', section: 'CLUTCH', position: '13' },
    { id: 'carb16', section: 'CARBURETTOR', position: '16' },
  ];
  assert.deepEqual(
    applyExplicitOccurrenceConstraints('parafuso posição 16 na vista embreagem', candidates),
    candidates,
  );
});

test('usa a restrição comprovada quando a outra informação não existe na extração', () => {
  const byPosition = [
    { id: 'p16', section: null, position: '16' },
    { id: 'p13', section: null, position: '13' },
  ];
  assert.deepEqual(
    applyExplicitOccurrenceConstraints('parafuso posição 16 na vista embreagem', byPosition).map(item => item.id),
    ['p16'],
  );

  const bySection = [
    { id: 'clutch', section: 'CLUTCH', position: null },
    { id: 'carb', section: 'CARBURETTOR', position: null },
  ];
  assert.deepEqual(
    applyExplicitOccurrenceConstraints('parafuso posição 16 na vista embreagem', bySection).map(item => item.id),
    ['clutch'],
  );
});
