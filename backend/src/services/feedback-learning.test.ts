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

test('repetições do mesmo usuário não pesam como vários confirmadores', () => {
  const one = [{ id: 'right', normalizedModel: '143RII', normalizedPnc: null, universalAcrossPnc: true, feedbackScore: 0 }];
  const repeated = [{ ...one[0] }];
  const signal = {
    resultPartId: 'right', correctedPartId: null, correct: true,
    normalizedQuery: 'carburador 143rii', normalizedModel: '143RII', normalizedPnc: null,
    userId: 'same-user', createdAt: new Date(),
  };
  applyFeedbackLearning('carburador 143rii', one, [signal]);
  applyFeedbackLearning('carburador 143rii', repeated, [signal, signal, signal]);
  assert.equal(repeated[0].feedbackScore, one[0].feedbackScore);
});

test('confirmações independentes aumentam o sinal sem ultrapassar o teto', () => {
  const single = [{ id: 'right', normalizedModel: '143RII', normalizedPnc: null, universalAcrossPnc: true, feedbackScore: 0 }];
  const consensus = [{ ...single[0] }];
  const base = {
    resultPartId: 'right', correctedPartId: null, correct: true,
    normalizedQuery: 'carburador 143rii', normalizedModel: '143RII', normalizedPnc: null,
    createdAt: new Date(),
  };
  applyFeedbackLearning('carburador 143rii', single, [{ ...base, userId: 'u1' }]);
  applyFeedbackLearning('carburador 143rii', consensus, [{ ...base, userId: 'u1' }, { ...base, userId: 'u2' }]);
  assert.ok(consensus[0].feedbackScore > single[0].feedbackScore);
  assert.ok(consensus[0].feedbackScore <= 0.16);
});
