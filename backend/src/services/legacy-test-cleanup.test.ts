import assert from 'node:assert/strict';
import test from 'node:test';
import { isLegacyTestCandidate, LEGACY_TEST_DOCUMENT_IDS, type LegacyTestCandidate } from './legacy-test-cleanup';

function candidate(overrides: Partial<LegacyTestCandidate> = {}): LegacyTestCandidate {
  return {
    id: LEGACY_TEST_DOCUMENT_IDS[0],
    filename: 'dummy.pdf',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    storagePath: null,
    contentHash: null,
    status: 'COMPLETED',
    processingStage: 'IDLE',
    processingJobId: null,
    manufacturer: null,
    model: null,
    pnc: null,
    categoryId: null,
    extractionSnapshot: null,
    extractionMethod: null,
    extractedAt: null,
    createdAt: new Date('2026-08-26T20:00:00.000Z'),
    _count: { parts: 0, chunks: 0, favorites: 0 },
    ...overrides,
  };
}

test('legacy cleanup recognizes only the obsolete empty W3C test shape', () => {
  assert.equal(isLegacyTestCandidate(candidate()), true);
  assert.equal(LEGACY_TEST_DOCUMENT_IDS.length, 21);
});

test('legacy cleanup refuses real or useful catalog data', () => {
  assert.equal(isLegacyTestCandidate(candidate({ filename: 'Cortador de grama Husqvarna LB 155S.pdf' })), false);
  assert.equal(isLegacyTestCandidate(candidate({ storagePath: 'tenant/real.pdf' })), false);
  assert.equal(isLegacyTestCandidate(candidate({ contentHash: 'abc123' })), false);
  assert.equal(isLegacyTestCandidate(candidate({ model: 'LB 155S' })), false);
  assert.equal(isLegacyTestCandidate(candidate({ extractionMethod: 'PARSER' })), false);
  assert.equal(isLegacyTestCandidate(candidate({ _count: { parts: 1, chunks: 0, favorites: 0 } })), false);
  assert.equal(isLegacyTestCandidate(candidate({ _count: { parts: 0, chunks: 1, favorites: 0 } })), false);
  assert.equal(isLegacyTestCandidate(candidate({ _count: { parts: 0, chunks: 0, favorites: 1 } })), false);
});

test('legacy cleanup refuses records outside the original test window or URL', () => {
  assert.equal(isLegacyTestCandidate(candidate({ createdAt: new Date('2026-08-27T00:00:00.000Z') })), false);
  assert.equal(isLegacyTestCandidate(candidate({ url: 'https://example.com/real.pdf' })), false);
});
