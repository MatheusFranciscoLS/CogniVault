import test from 'node:test';
import assert from 'node:assert/strict';
import { isExplicitUnpositionedMarker, resolvePositionProvenance } from './position-provenance';

test('mantém uma posição publicada pelo catálogo', () => {
  assert.deepEqual(resolvePositionProvenance({ position: '17' }), {
    position: '17',
    positionStatus: 'POSITIONED',
    positionEvidence: '17',
  });
});

test('interpreta traço de KEY/REF como ausência explícita na fonte', () => {
  assert.equal(isExplicitUnpositionedMarker('- -'), true);
  assert.equal(isExplicitUnpositionedMarker('--'), true);
  assert.deepEqual(resolvePositionProvenance({ position: '- -' }), {
    position: null,
    positionStatus: 'SOURCE_UNPOSITIONED',
    positionEvidence: '- -',
  });
});

test('aceita status explícito de linha sem callout', () => {
  assert.deepEqual(resolvePositionProvenance({
    position: '',
    positionStatus: 'SOURCE_UNPOSITIONED',
    positionEvidence: 'REF em branco',
  }), {
    position: null,
    positionStatus: 'SOURCE_UNPOSITIONED',
    positionEvidence: 'REF em branco',
  });
});

test('posição vazia sem evidência nunca é inventada', () => {
  assert.deepEqual(resolvePositionProvenance({ position: '' }), {
    position: null,
    positionStatus: 'SUSPECT_MISSING',
    positionEvidence: null,
  });
});

test('não aceita POSITIONED sem número/callout', () => {
  assert.deepEqual(resolvePositionProvenance({ positionStatus: 'POSITIONED' }), {
    position: null,
    positionStatus: 'SUSPECT_MISSING',
    positionEvidence: null,
  });
});
