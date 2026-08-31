import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHusqvarnaPortalUrl,
  deriveOfficialVerificationStatus,
  isAllowedHusqvarnaPortalUrl,
  officialVerificationFreshUntil,
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

test('cache oficial tem validade previsível sem apagar o histórico', () => {
  const previous = process.env.OFFICIAL_VERIFICATION_CACHE_DAYS;
  process.env.OFFICIAL_VERIFICATION_CACHE_DAYS = '90';
  assert.equal(
    officialVerificationFreshUntil(new Date('2026-01-01T00:00:00Z')).toISOString(),
    '2026-04-01T00:00:00.000Z',
  );
  if (previous === undefined) delete process.env.OFFICIAL_VERIFICATION_CACHE_DAYS;
  else process.env.OFFICIAL_VERIFICATION_CACHE_DAYS = previous;
});
