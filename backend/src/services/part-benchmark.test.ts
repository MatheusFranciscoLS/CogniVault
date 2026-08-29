import assert from 'node:assert/strict';
import test from 'node:test';
import { HUSQVARNA_GOLDEN_BENCHMARK } from './part-benchmark-cases';
import { evaluatePartBenchmark } from './part-benchmark';

test('benchmark calcula Top-1, Recall@5, MRR e NDCG@5', () => {
  const cases = [
    { id: 'a', query: 'a', model: 'A', expectedPartNumbers: ['100'], source: 'fixture' },
    { id: 'b', query: 'b', model: 'B', expectedPartNumbers: ['200'], source: 'fixture' },
    { id: 'c', query: 'c', model: 'C', expectedPartNumbers: ['300'], source: 'fixture' },
  ];
  const metrics = evaluatePartBenchmark(cases, [
    { caseId: 'a', returnedPartNumbers: ['100'] },
    { caseId: 'b', returnedPartNumbers: ['999', '200'] },
    { caseId: 'c', returnedPartNumbers: ['999'] },
  ]);

  assert.equal(metrics.total, 3);
  assert.equal(metrics.top1Accuracy, 1 / 3);
  assert.equal(metrics.recallAt5, 2 / 3);
  assert.ok(Math.abs(metrics.mrr - 0.5) < 1e-9);
  assert.ok(metrics.ndcgAt5 > 0.5 && metrics.ndcgAt5 < 0.6);
  assert.equal(metrics.missRate, 1 / 3);
});

test('golden set tem IDs únicos e sempre aponta para código e fonte comprovada', () => {
  assert.ok(HUSQVARNA_GOLDEN_BENCHMARK.length >= 15);
  const ids = new Set(HUSQVARNA_GOLDEN_BENCHMARK.map(item => item.id));
  assert.equal(ids.size, HUSQVARNA_GOLDEN_BENCHMARK.length);

  for (const benchmarkCase of HUSQVARNA_GOLDEN_BENCHMARK) {
    assert.ok(benchmarkCase.query.trim().length > 10, benchmarkCase.id);
    assert.ok(benchmarkCase.model.trim(), benchmarkCase.id);
    assert.ok(benchmarkCase.expectedPartNumbers.length > 0, benchmarkCase.id);
    assert.ok(benchmarkCase.expectedPartNumbers.every(code => /^\d{6,}$/.test(code)), benchmarkCase.id);
    assert.ok(benchmarkCase.source.includes('.pdf'), benchmarkCase.id);
  }
});
