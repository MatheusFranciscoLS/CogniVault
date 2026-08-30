import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveOfficialVerificationStatus } from './official-part-verification.service';

test('employee confirmation derives status without trusting a client supplied state', () => {
  assert.equal(deriveOfficialVerificationStatus('586931401', '587106701'), 'SUPERSEDED');
  assert.equal(deriveOfficialVerificationStatus('587106701', '587 106 701'), 'VERIFIED');
});
