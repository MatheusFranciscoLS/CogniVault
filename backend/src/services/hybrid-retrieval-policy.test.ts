import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_FULL_TEXT_RESULTS_TO_SKIP_FUZZY,
  shouldRunFuzzyPartRetrieval,
} from './hybrid-retrieval-policy';

test('runs fuzzy retrieval when full-text evidence is sparse', () => {
  assert.equal(shouldRunFuzzyPartRetrieval(0), true);
  assert.equal(shouldRunFuzzyPartRetrieval(MIN_FULL_TEXT_RESULTS_TO_SKIP_FUZZY - 1), true);
});

test('skips fuzzy retrieval when full-text already has enough candidates', () => {
  assert.equal(shouldRunFuzzyPartRetrieval(MIN_FULL_TEXT_RESULTS_TO_SKIP_FUZZY), false);
  assert.equal(shouldRunFuzzyPartRetrieval(MIN_FULL_TEXT_RESULTS_TO_SKIP_FUZZY + 20), false);
});

test('fails open to fuzzy retrieval for invalid counts', () => {
  assert.equal(shouldRunFuzzyPartRetrieval(Number.NaN), true);
  assert.equal(shouldRunFuzzyPartRetrieval(Number.POSITIVE_INFINITY), true);
});
