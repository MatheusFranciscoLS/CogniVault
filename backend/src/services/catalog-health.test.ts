import assert from 'node:assert/strict';
import test from 'node:test';
import { assessCatalogHealth } from './catalog-health';

test('keeps a well structured catalog ready with high health score', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: '372 XP',
    pnc: '965702302',
    extractedModels: ['372 XP'],
    extractedPncs: ['965702302'],
    snapshotPartCount: 320,
    partCount: 320,
    partsWithPage: 320,
    partsWithSection: 318,
    partsWithPosition: 320,
    chunkCount: 28,
    embeddedPartCount: 320,
    extractionMethod: 'HUSQVARNA_IPL_TEXT',
    processingStage: 'READY',
    category: 'Motosserras',
  });
  assert.equal(result.reviewStatus, 'READY');
  assert.ok(result.score >= 95);
  assert.equal(result.reasons.length, 0);
});

test('requires review for ambiguous PNC instead of pretending universal compatibility', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: 'TS114',
    pnc: null,
    extractedModels: ['TS114'],
    extractedPncs: ['970622401', '970622402'],
    partCount: 250,
    partsWithPage: 240,
    partsWithSection: 250,
    partsWithPosition: 250,
    chunkCount: 20,
    embeddedPartCount: 250,
  });
  assert.equal(result.reviewStatus, 'NEEDS_REVIEW');
  assert.ok(result.reasons.some(reason => reason.includes('mais de um PNC')));
});

test('missing embeddings do not invalidate an otherwise usable catalog', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: '143RII',
    pnc: '967332904',
    extractedModels: ['143RII'],
    extractedPncs: ['967332904'],
    partCount: 258,
    partsWithPage: 258,
    partsWithSection: 258,
    partsWithPosition: 258,
    chunkCount: 18,
    embeddedPartCount: 0,
    extractionMethod: 'GEMINI:gemini-3.6-flash',
    processingStage: 'READY_WITHOUT_EMBEDDINGS',
    category: 'Roçadeiras',
  });
  assert.equal(result.reviewStatus, 'READY');
  assert.ok(result.score >= 90);
  assert.ok(result.warnings.some(warning => warning.includes('vetorial')));
});

test('very incomplete extraction is stopped for human review', () => {
  const result = assessCatalogHealth({
    manufacturer: null,
    model: null,
    partCount: 4,
    partsWithPage: 0,
    partsWithSection: 1,
    partsWithPosition: 1,
    chunkCount: 0,
    embeddedPartCount: 0,
  });
  assert.equal(result.reviewStatus, 'NEEDS_REVIEW');
  assert.ok(result.score < 40);
});

test('conflicting codes in the same exploded-view position require review', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: 'LC 151S',
    partCount: 90,
    partsWithPage: 90,
    partsWithSection: 90,
    partsWithPosition: 90,
    chunkCount: 8,
    embeddedPartCount: 90,
    conflictingOccurrenceCount: 2,
  });
  assert.equal(result.reviewStatus, 'NEEDS_REVIEW');
  assert.ok(result.reasons.some(reason => reason.includes('associadas a mais de um código')));
});

test('large gap between extracted snapshot and persisted parts requires review', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: 'HU725AWD',
    snapshotPartCount: 120,
    partCount: 70,
    partsWithPage: 70,
    partsWithSection: 70,
    partsWithPosition: 70,
    chunkCount: 10,
    embeddedPartCount: 70,
  });
  assert.equal(result.reviewStatus, 'NEEDS_REVIEW');
  assert.ok(result.reasons.some(reason => reason.includes('120 linhas extraídas')));
});

test('model, PNC and malformed-code mismatches cannot be hidden by otherwise good coverage', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: 'LC 353AWD',
    pnc: '96145003301',
    partCount: 110,
    partsWithPage: 110,
    partsWithSection: 110,
    partsWithPosition: 110,
    chunkCount: 12,
    embeddedPartCount: 110,
    modelMismatchCount: 1,
    pncMismatchCount: 2,
    malformedPartNumberCount: 1,
  });
  assert.equal(result.reviewStatus, 'NEEDS_REVIEW');
  assert.ok(result.reasons.some(reason => reason.includes('modelo diferente')));
  assert.ok(result.reasons.some(reason => reason.includes('PNC diferente')));
  assert.ok(result.reasons.some(reason => reason.includes('formato estrutural inesperado')));
});

test('duplicate occurrences alone are surfaced as a warning without inventing a conflict', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: 'GX 560',
    partCount: 38,
    partsWithPage: 38,
    partsWithSection: 38,
    partsWithPosition: 38,
    chunkCount: 4,
    embeddedPartCount: 38,
    duplicateOccurrenceCount: 1,
  });
  assert.equal(result.reviewStatus, 'READY');
  assert.ok(result.warnings.some(warning => warning.includes('duplicadas')));
  assert.ok(!result.reasons.some(reason => reason.includes('mais de um código')));
});
