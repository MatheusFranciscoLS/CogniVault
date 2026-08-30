import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestAutoMetadataRepair } from './catalog-metadata-repair';

const parts = Array.from({ length: 10 }, () => ({
  manufacturer: 'Husqvarna',
  model: '321R',
  pnc: null,
  universalAcrossPnc: true,
}));

test('repairs a description accidentally persisted as model from a part row', () => {
  const result = suggestAutoMetadataRepair({
    manufacturer: 'Husqvarna',
    model: 'assy 321S',
    pnc: null,
    metadataReviewedAt: null,
    parts,
  });
  assert.equal(result.changed, true);
  assert.equal(result.model, '321R');
});

test('does not overwrite a legitimate model automatically', () => {
  const result = suggestAutoMetadataRepair({
    manufacturer: 'Husqvarna',
    model: '321S',
    pnc: null,
    metadataReviewedAt: null,
    parts,
  });
  assert.equal(result.changed, false);
  assert.equal(result.model, undefined);
});

test('never overwrites metadata that the administrator already reviewed', () => {
  const result = suggestAutoMetadataRepair({
    manufacturer: 'Husqvarna',
    model: 'assy 321S',
    pnc: null,
    metadataReviewedAt: new Date(),
    parts,
  });
  assert.deepEqual(result, { changed: false });
});

test('fills a unique PNC only when active rows prove one non-universal application', () => {
  const result = suggestAutoMetadataRepair({
    manufacturer: null,
    model: null,
    pnc: null,
    metadataReviewedAt: null,
    parts: parts.map(part => ({ ...part, pnc: '967332904', universalAcrossPnc: false })),
  });
  assert.equal(result.changed, true);
  assert.equal(result.manufacturer, 'Husqvarna');
  assert.equal(result.model, '321R');
  assert.equal(result.pnc, '967332904');
});
