import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSearchIntelligenceLimit } from './search-intelligence.service';

test('search intelligence limit remains bounded for admin requests', () => {
  assert.equal(normalizeSearchIntelligenceLimit(Number.NaN), 20);
  assert.equal(normalizeSearchIntelligenceLimit(0), 1);
  assert.equal(normalizeSearchIntelligenceLimit(25.9), 25);
  assert.equal(normalizeSearchIntelligenceLimit(1000000), 100);
});
