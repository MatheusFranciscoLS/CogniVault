import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHusqvarnaPortalUrl, isAllowedHusqvarnaPortalUrl } from './official-part-verification.service';

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
