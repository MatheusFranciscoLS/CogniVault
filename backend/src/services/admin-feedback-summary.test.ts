import assert from 'node:assert/strict';
import test from 'node:test';
import { feedbackLearningStage, feedbackReasonCounts } from './admin-feedback-summary';

test('feedback learning stage uses exact tenant-wide independent signal thresholds', () => {
  assert.deepEqual(feedbackLearningStage(0), { learningLevel: 'COLD_START', nextMilestone: 5 });
  assert.deepEqual(feedbackLearningStage(4), { learningLevel: 'COLD_START', nextMilestone: 5 });
  assert.deepEqual(feedbackLearningStage(5), { learningLevel: 'LEARNING', nextMilestone: 20 });
  assert.deepEqual(feedbackLearningStage(19), { learningLevel: 'LEARNING', nextMilestone: 20 });
  assert.deepEqual(feedbackLearningStage(20), { learningLevel: 'ESTABLISHED', nextMilestone: null });
});

test('feedback reason counts ignore null and invalid aggregate rows', () => {
  assert.deepEqual(feedbackReasonCounts([
    { reason: 'WRONG_CODE', count: 12 },
    { reason: 'WRONG_MODEL', count: 3 },
    { reason: null, count: 9 },
    { reason: 'BAD_ZERO', count: 0 },
    { reason: 'BAD_NAN', count: Number.NaN },
  ]), {
    WRONG_CODE: 12,
    WRONG_MODEL: 3,
  });
});
