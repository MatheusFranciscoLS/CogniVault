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
    partCount: 320,
    partsWithPage: 320,
    partsWithSection: 318,
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
    chunkCount: 0,
    embeddedPartCount: 0,
  });
  assert.equal(result.reviewStatus, 'NEEDS_REVIEW');
  assert.ok(result.score < 40);
});
