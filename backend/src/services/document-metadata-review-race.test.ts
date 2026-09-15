import assert from 'node:assert/strict';
import test from 'node:test';
import { metadataReviewMutation } from './document.service';

test('metadata review fields are part of the same reprocess reservation mutation', () => {
  const reviewedAt = new Date('2026-09-15T18:30:00.000Z');

  assert.deepEqual(metadataReviewMutation({
    manufacturer: 'Husqvarna',
    model: '143RII',
    pnc: '966621501',
    reviewedAt,
    reviewedById: 'user-1',
  }), {
    manufacturer: 'Husqvarna',
    model: '143RII',
    pnc: '966621501',
    metadataReviewedAt: reviewedAt,
    metadataReviewedById: 'user-1',
    reviewStatus: 'PENDING',
    qualityCheckedAt: null,
  });
});

test('ordinary reprocessing carries no metadata mutation', () => {
  assert.deepEqual(metadataReviewMutation(), {});
});
