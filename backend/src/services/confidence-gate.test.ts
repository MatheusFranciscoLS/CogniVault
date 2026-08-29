import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAnswerConfidence } from './confidence-gate';
import type { PartCandidate } from './part-search.service';

function candidate(overrides: Partial<PartCandidate> = {}): PartCandidate {
  return {
    id: 'part-1', documentId: 'doc-1', filename: 'catalog.pdf', manufacturer: 'Husqvarna',
    model: 'Z460', normalizedModel: 'Z460', pnc: '970000001', normalizedPnc: '970000001',
    universalAcrossPnc: false, section: 'TRANSMISSION', position: '4', name: 'Transmission LH',
    alternativeNames: [], partNumber: '594090301', normalizedPartNumber: '594090301', page: 20,
    notes: 'LH', distance: 0.20, feedbackScore: 0, searchMethod: 'SEMANTIC', retrievalScore: 0.84,
    retrievalSources: ['SEMANTIC', 'LEXICAL', 'FULL_TEXT'], retrievalAgreement: 3,
    ...overrides,
  };
}

test('direct code remains exact even when the source catalog requires structural review', () => {
  const result = evaluateAnswerConfidence({
    question: '594090301',
    chosen: candidate({ searchMethod: 'DIRECT_CODE', retrievalSources: ['DIRECT_CODE'] }),
    selectionConfidence: 1,
    catalog: { healthScore: 42, reviewStatus: 'NEEDS_REVIEW', reviewReasons: ['Modelo não confirmado no catálogo.'] },
  });
  assert.equal(result.safe, true);
  assert.equal(result.confidence, 1);
  assert.equal(result.level, 'EXACT');
  assert.ok(result.evidence.some(item => item.includes('revisão estrutural')));
});

test('independent retrieval agreement and explicit LH constraint can release a high-confidence answer', () => {
  const result = evaluateAnswerConfidence({
    question: 'transmissão esquerda LH do Z460',
    chosen: candidate(),
    runnerUp: candidate({ id: 'part-2', name: 'Transmission RH', partNumber: '594090302', normalizedPartNumber: '594090302', notes: 'RH', retrievalScore: 0.52, distance: 0.40 }),
    selectionConfidence: 0.91,
    catalog: { healthScore: 94, reviewStatus: 'REVIEWED' },
  });
  assert.equal(result.safe, true);
  assert.ok(result.confidence >= 0.8);
  assert.ok(result.evidence.some(item => item.includes('revisão administrativa')));
});

test('fuzzy-only typo recovery never releases a code automatically', () => {
  const result = evaluateAnswerConfidence({
    question: 'trasmissao esquerda z460',
    chosen: candidate({ searchMethod: 'LEXICAL', retrievalSources: ['FUZZY'], retrievalAgreement: 1, retrievalScore: 0.8 }),
    selectionConfidence: 0.92,
    catalog: { healthScore: 96, reviewStatus: 'REVIEWED' },
  });
  assert.equal(result.safe, false);
  assert.ok(result.confidence <= 0.66);
});

test('a near-tie between different codes remains ambiguous', () => {
  const result = evaluateAnswerConfidence({
    question: 'mola do freio 372 XP',
    chosen: candidate({ model: '372 XP', normalizedModel: '372XP', name: 'Brake spring', partNumber: 'A', normalizedPartNumber: 'A', retrievalScore: 0.70, distance: 0.28, retrievalSources: ['LEXICAL', 'FULL_TEXT'], retrievalAgreement: 2 }),
    runnerUp: candidate({ id: 'part-2', model: '372 XP', normalizedModel: '372XP', name: 'Spring', partNumber: 'B', normalizedPartNumber: 'B', retrievalScore: 0.69, distance: 0.29, retrievalSources: ['LEXICAL', 'FULL_TEXT'], retrievalAgreement: 2 }),
    selectionConfidence: 0.78,
    catalog: { healthScore: 91, reviewStatus: 'READY' },
  });
  assert.equal(result.safe, false);
});

test('an inferred result is blocked when its catalog needs review even with strong retrieval agreement', () => {
  const result = evaluateAnswerConfidence({
    question: 'transmissão esquerda LH do Z460',
    chosen: candidate(),
    runnerUp: candidate({ id: 'part-2', name: 'Transmission RH', partNumber: '594090302', normalizedPartNumber: '594090302', notes: 'RH', retrievalScore: 0.40, distance: 0.48 }),
    selectionConfidence: 0.95,
    catalog: { healthScore: 82, reviewStatus: 'NEEDS_REVIEW', reviewReasons: ['O PDF contém mais de um PNC.'] },
  });
  assert.equal(result.safe, false);
  assert.equal(result.level, 'REVIEW');
  assert.ok(result.reason.includes('catálogo de origem'));
});

test('a low-health catalog blocks inferred code release even when review status is not explicitly bad', () => {
  const result = evaluateAnswerConfidence({
    question: 'transmissão esquerda LH do Z460',
    chosen: candidate(),
    selectionConfidence: 0.95,
    catalog: { healthScore: 48, reviewStatus: 'PENDING', reviewReasons: ['Menos da metade das peças possui seção/vista identificada.'] },
  });
  assert.equal(result.safe, false);
  assert.ok(result.evidence.some(item => item.includes('abaixo do mínimo')));
});
