import assert from 'node:assert/strict';
import test from 'node:test';
import { isDocumentBusy } from './document-processing-state';

test('treats queued and active documents as busy even when the job id is stale or missing', () => {
  assert.equal(isDocumentBusy('PENDING', null), true);
  assert.equal(isDocumentBusy('PROCESSING', null), true);
  assert.equal(isDocumentBusy('COMPLETED', 'job-1'), true);
});

test('allows completed and failed documents to be archived safely', () => {
  assert.equal(isDocumentBusy('COMPLETED', null), false);
  assert.equal(isDocumentBusy('FAILED', 'stale-job'), false);
  assert.equal(isDocumentBusy('FAILED', null), false);
});
