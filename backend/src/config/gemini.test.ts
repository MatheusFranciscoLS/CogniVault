import assert from 'node:assert/strict';
import test from 'node:test';
import { geminiRequestTimeoutMs } from './gemini';

test('Gemini request timeout defaults to three minutes and stays bounded', () => {
    assert.equal(geminiRequestTimeoutMs(undefined), 180_000);
    assert.equal(geminiRequestTimeoutMs('1'), 30_000);
    assert.equal(geminiRequestTimeoutMs('180000'), 180_000);
    assert.equal(geminiRequestTimeoutMs('999999'), 300_000);
    assert.equal(geminiRequestTimeoutMs('not-a-number'), 180_000);
});
