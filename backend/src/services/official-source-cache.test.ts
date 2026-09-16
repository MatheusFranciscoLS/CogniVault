import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOfficialSourceCacheKey } from './official-source-cache.service';

test('official source cache key is stable when object field order changes', () => {
  const first = buildOfficialSourceCacheKey('HUSQVARNA', 'GRAPHQL_searchForProducts', {
    site: 'b2b-br-pt-br',
    searchTerm: '967176501',
    options: { take: 5, skip: 0 },
  });
  const second = buildOfficialSourceCacheKey('HUSQVARNA', 'GRAPHQL_searchForProducts', {
    options: { skip: 0, take: 5 },
    searchTerm: '967176501',
    site: 'b2b-br-pt-br',
  });

  assert.equal(first, second);
});

test('official source cache key separates different resources', () => {
  const first = buildOfficialSourceCacheKey('HUSQVARNA', 'LIVE_PART', '587106701');
  const second = buildOfficialSourceCacheKey('HUSQVARNA', 'LIVE_PART', '587106702');
  assert.notEqual(first, second);
});
