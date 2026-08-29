import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFeedbackBenchmarkCases } from './feedback-benchmark';

test('feedback corrigido vira resposta esperada e hard negative', () => {
  const cases = buildFeedbackBenchmarkCases([
    {
      id: 'fb1',
      query: 'qual o pistão da bomba do 321S25?',
      pnc: null,
      resultPart: { partNumber: '590210901', model: '321S25', pnc: null },
      correctedPart: { partNumber: '589832901', model: '321S25', pnc: null },
    },
  ]);

  assert.deepEqual(cases, [{
    id: 'feedback:fb1',
    query: 'qual o pistão da bomba do 321S25?',
    model: '321S25',
    expectedPartNumbers: ['589832901'],
    hardNegativePartNumbers: ['590210901'],
    source: 'Correção real do balcão (fb1)',
  }]);
});

test('ignora feedback sem correção ou sem mudança real de código', () => {
  const cases = buildFeedbackBenchmarkCases([
    {
      id: 'fb1',
      query: 'x',
      resultPart: { partNumber: '100000', model: 'X' },
      correctedPart: null,
    },
    {
      id: 'fb2',
      query: 'y',
      resultPart: { partNumber: '200000', model: 'Y' },
      correctedPart: { partNumber: '200000', model: 'Y' },
    },
  ]);

  assert.equal(cases.length, 0);
});

test('deduplica a mesma correção repetida', () => {
  const row = {
    query: 'transmissão esquerda Z460',
    resultPart: { partNumber: '594090302', model: 'Z460', pnc: null },
    correctedPart: { partNumber: '594090301', model: 'Z460', pnc: null },
  };
  const cases = buildFeedbackBenchmarkCases([
    { id: 'fb1', ...row },
    { id: 'fb2', ...row },
  ]);

  assert.equal(cases.length, 1);
});
