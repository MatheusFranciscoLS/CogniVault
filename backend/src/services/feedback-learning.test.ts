import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFeedbackLearning, feedbackQuerySimilarity } from './feedback-learning';

test('reconhece perguntas equivalentes em português e no termo técnico do catálogo', () => {
  assert.ok(feedbackQuerySimilarity('qual o código do carburador da 143RII', 'CARBURETTOR 143RII') >= 0.9);
});

test('feedback negativo reduz a peça errada e favorece a correção sem ultrapassar o limite seguro', () => {
  const candidates = [
    { id: 'wrong', normalizedModel: '143RII', normalizedPnc: null, universalAcrossPnc: true, feedbackScore: 0 },
    { id: 'right', normalizedModel: '143RII', normalizedPnc: null, universalAcrossPnc: true, feedbackScore: 0 },
  ];
  const signal = {
    resultPartId: 'wrong', correctedPartId: 'right', correct: false,
    normalizedQuery: 'carburador 143rii', normalizedModel: '143RII', normalizedPnc: null,
  };

  applyFeedbackLearning('qual o código do carburador da 143RII', candidates, [signal, signal, signal]);

  assert.ok(candidates[0].feedbackScore < 0);
  assert.ok(candidates[1].feedbackScore > 0);
  assert.ok(candidates[0].feedbackScore >= -0.18);
  assert.ok(candidates[1].feedbackScore <= 0.18);
});

test('não transfere feedback entre modelos incompatíveis', () => {
  const candidates = [
    { id: 'part', normalizedModel: '143RII', normalizedPnc: null, universalAcrossPnc: true, feedbackScore: 0 },
  ];
  applyFeedbackLearning('carburador', candidates, [{
    resultPartId: 'part', correctedPartId: null, correct: true,
    normalizedQuery: 'carburador', normalizedModel: '236R', normalizedPnc: null,
  }]);
  assert.equal(candidates[0].feedbackScore, 0);
});
