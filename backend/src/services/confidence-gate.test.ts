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

test('direct code is always exact because it came from an active Part row', () => {
  const result = evaluateAnswerConfidence({
    question: '594090301', chosen: candidate({ searchMethod: 'DIRECT_CODE', retrievalSources: ['DIRECT_CODE'] }), selectionConfidence: 1,
  });
  assert.equal(result.safe, true);
  assert.equal(result.confidence, 1);
  assert.equal(result.level, 'EXACT');
});

test('independent retrieval agreement and explicit LH constraint can release a high-confidence answer', () => {
  const result = evaluateAnswerConfidence({
    question: 'transmissão esquerda LH do Z460',
    chosen: candidate(),
    runnerUp: candidate({ id: 'part-2', name: 'Transmission RH', partNumber: '594090302', normalizedPartNumber: '594090302', notes: 'RH', retrievalScore: 0.52, distance: 0.40 }),
    selectionConfidence: 0.91,
  });
  assert.equal(result.safe, true);
  assert.ok(result.confidence >= 0.8);
});

test('fuzzy-only typo recovery never releases a code automatically', () => {
  const result = evaluateAnswerConfidence({
    question: 'trasmissao esquerda z460',
    chosen: candidate({ searchMethod: 'LEXICAL', retrievalSources: ['FUZZY'], retrievalAgreement: 1, retrievalScore: 0.8 }),
    selectionConfidence: 0.92,
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
  });
  assert.equal(result.safe, false);
});
