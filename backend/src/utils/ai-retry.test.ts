import assert from 'node:assert/strict';
import test from 'node:test';
import { isDailyAIQuotaError, isTransientAIError, retryDelayMs, withTransientAIRetry } from './ai-retry';

test('reconhece indisponibilidade temporária sem repetir erros permanentes', () => {
    assert.equal(isTransientAIError({ status: 503 }), true);
    assert.equal(isTransientAIError({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }), true);
    assert.equal(isTransientAIError(new Error('This model is currently experiencing high demand.')), true);
    assert.equal(isTransientAIError({ cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } }), true);
    assert.equal(isTransientAIError({ status: 400 }), false);
    assert.equal(isTransientAIError(new Error('PDF inválido')), false);
});

test('respeita RetryInfo da API e reconhece limite diário', () => {
    const quotaError = {
        error: {
            code: 429,
            message: 'You exceeded your current quota, please check your plan and billing details.',
            status: 'RESOURCE_EXHAUSTED',
            details: [
                {
                    '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                    violations: [{
                        quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
                        quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
                        quotaDimensions: { model: 'gemini-3.6-flash', location: 'global' },
                        quotaValue: '20',
                    }],
                },
                {
                    '@type': 'type.googleapis.com/google.rpc.RetryInfo',
                    retryDelay: '48s',
                },
            ],
        },
    };

    assert.equal(retryDelayMs(quotaError), 48_000);
    assert.equal(isDailyAIQuotaError(quotaError), true);
    assert.equal(isDailyAIQuotaError(new Error('GenerateRequestsPerDayPerProjectPerModel-FreeTier')), true);
    assert.equal(retryDelayMs(new Error('Please retry in 23.520s.')), 23_520);
});

test('429 temporário sem quota diária continua elegível para retry', () => {
    const minuteLimit = {
        error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            message: 'Rate limit exceeded. Please retry later.',
            details: [{
                violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel' }],
            }],
        },
    };
    assert.equal(isTransientAIError(minuteLimit), true);
    assert.equal(isDailyAIQuotaError(minuteLimit), false);
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

test('não repete internamente uma cota diária real do Gemini', async () => {
    let calls = 0;
    const dailyQuota = {
        error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            message: 'You exceeded your current quota.',
            details: [{
                violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
            }],
        },
    };

    await assert.rejects(
        withTransientAIRetry(
            async () => {
                calls += 1;
                throw dailyQuota;
            },
            { label: 'quota diária', maxAttempts: 4, baseDelayMs: 0, onRetry: () => undefined },
        ),
    );

    assert.equal(calls, 1);
});
