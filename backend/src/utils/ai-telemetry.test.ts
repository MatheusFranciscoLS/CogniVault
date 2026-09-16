import assert from 'node:assert/strict';
import test from 'node:test';
import { extractAiUsage } from './ai-telemetry';

test('lê usage em snake_case da Interactions API', () => {
  assert.deepEqual(extractAiUsage({ usage: { total_tokens: 120, prompt_tokens: 90, completion_tokens: 30 } }), {
    totalTokens: 120,
    promptTokens: 90,
    completionTokens: 30,
  });
});

test('lê usage em camelCase e calcula total quando necessário', () => {
  assert.deepEqual(extractAiUsage({ usageMetadata: { inputTokens: 42, outputTokens: 8 } }), {
    totalTokens: 50,
    promptTokens: 42,
    completionTokens: 8,
  });
});

test('usage ausente não inventa consumo', () => {
  assert.deepEqual(extractAiUsage({}), { totalTokens: 0, promptTokens: 0, completionTokens: 0 });
});
