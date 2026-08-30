import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHusqvarnaPortalUrl,
  deriveOfficialVerificationStatus,
  isAllowedHusqvarnaPortalUrl,
} from './official-part-verification.service';

test('builds only the public Husqvarna spare-parts URL with normalized code', () => {
  assert.equal(
    buildHusqvarnaPortalUrl('587 106 701'),
    'https://portal.husqvarnagroup.com/br/spare-parts/?part=587106701',
  );
});

test('accepts the exact official URL for the current code', () => {
  assert.equal(
    isAllowedHusqvarnaPortalUrl(
      'https://portal.husqvarnagroup.com/br/spare-parts/?part=587106701',
      '587106701',
    ),
    true,
  );
});

test('rejects authenticated, alternate or mismatched URLs', () => {
  assert.equal(isAllowedHusqvarnaPortalUrl('https://portal.husqvarnagroup.com/login', '587106701'), false);
  assert.equal(isAllowedHusqvarnaPortalUrl('https://example.com/?part=587106701', '587106701'), false);
  assert.equal(
    isAllowedHusqvarnaPortalUrl('https://portal.husqvarnagroup.com/br/spare-parts/?part=586931401', '587106701'),
    false,
  );
});

test('classifies an unchanged portal code as verified automatically', () => {
  assert.equal(deriveOfficialVerificationStatus('587 106 701', '587106701'), 'VERIFIED');
});

test('classifies a changed portal code as superseded automatically', () => {
  assert.equal(deriveOfficialVerificationStatus('586 931 401', '587 106 701'), 'SUPERSEDED');
});

test('refuses to classify invalid part numbers', () => {
  assert.throws(() => deriveOfficialVerificationStatus('', '587106701'), /códigos de peça válidos/i);
});
