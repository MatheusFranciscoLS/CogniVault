import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOG_UPLOAD_LIMITS } from './upload-limits';

test('catalog upload keeps one PDF and only the three supported metadata fields', () => {
  assert.equal(CATALOG_UPLOAD_LIMITS.fileSize, 50 * 1024 * 1024);
  assert.equal(CATALOG_UPLOAD_LIMITS.files, 1);
  assert.equal(CATALOG_UPLOAD_LIMITS.fields, 3);
  assert.equal(CATALOG_UPLOAD_LIMITS.parts, 4);
  assert.equal(CATALOG_UPLOAD_LIMITS.fieldSize, 1024);
  assert.equal(CATALOG_UPLOAD_LIMITS.fieldNameSize, 100);
});
