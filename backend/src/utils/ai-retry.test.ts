import assert from 'node:assert/strict';
import test from 'node:test';
import { isTransientAIError, withTransientAIRetry } from './ai-retry';

test('reconhece indisponibilidade temporária sem repetir erros permanentes', () => {
    assert.equal(isTransientAIError({ status: 503 }), true);
    assert.equal(isTransientAIError({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }), true);
    assert.equal(isTransientAIError(new Error('This model is currently experiencing high demand.')), true);
    assert.equal(isTransientAIError({ status: 400 }), false);
    assert.equal(isTransientAIError(new Error('PDF inválido')), false);
});

test('repete operação temporariamente indisponível e preserva o resultado', async () => {
    let calls = 0;
    const retries: string[] = [];

    const result = await withTransientAIRetry(
        async () => {
            calls += 1;
            if (calls < 3) {
                throw { status: 503 };
            }
            return 'ok';
        },
        {
            label: 'teste',
            maxAttempts: 4,
            baseDelayMs: 0,
            onRetry: (message) => retries.push(message),
        },
    );

    assert.equal(result, 'ok');
    assert.equal(calls, 3);
    assert.equal(retries.length, 2);
});

test('não repete erro permanente', async () => {
    let calls = 0;

    await assert.rejects(
        withTransientAIRetry(
            async () => {
                calls += 1;
                throw { status: 400 };
            },
            {
                label: 'teste',
                maxAttempts: 4,
                baseDelayMs: 0,
                onRetry: () => undefined,
            },
        ),
    );

    assert.equal(calls, 1);
});

