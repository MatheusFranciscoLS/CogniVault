import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldForceCatalogReextraction } from './document-processing-intent';

test('preserva a intenção de reextração após reinício do worker', () => {
    assert.equal(shouldForceCatalogReextraction('COMPLETED', 'QUEUED_REEXTRACT'), true);
    assert.equal(shouldForceCatalogReextraction('COMPLETED', 'DOWNLOADING'), true);
    assert.equal(shouldForceCatalogReextraction('COMPLETED', 'EXTRACTING'), true);
});

test('não confunde upload inicial ou retomada de indexação com reextração', () => {
    assert.equal(shouldForceCatalogReextraction('PROCESSING', 'DOWNLOADING'), false);
    assert.equal(shouldForceCatalogReextraction('COMPLETED', 'INDEXING'), false);
    assert.equal(shouldForceCatalogReextraction('COMPLETED', 'READY'), false);
});
