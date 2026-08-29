import assert from 'node:assert/strict';
import test from 'node:test';
import { documentRetryCount, nextDocumentRetry } from './document-retry';

test('lê contador de reprocessamento sem aceitar valores inválidos', () => {
    assert.equal(documentRetryCount(undefined), 0);
    assert.equal(documentRetryCount({ 'x-retry-count': '2' }), 2);
    assert.equal(documentRetryCount({ 'x-retry-count': -5 }), 0);
});

test('agenda novo ciclo apenas para falha temporária e dentro do limite', () => {
    assert.equal(nextDocumentRetry({ status: 503 }, {}), 1);
    assert.equal(nextDocumentRetry({ status: 429 }, { 'x-retry-count': 2 }), 3);
    assert.equal(nextDocumentRetry({ status: 503 }, { 'x-retry-count': 3 }), null);
    assert.equal(nextDocumentRetry({ status: 400 }, {}), null);
});

test('não reenfileira cota diária da IA mesmo quando PerDay vem aninhado nos detalhes', () => {
    const dailyQuota = {
        error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            message: 'You exceeded your current quota, please check your plan and billing details.',
            details: [{
                '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                violations: [{
                    quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
                    quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
                    quotaValue: '20',
                }],
            }],
        },
    };
    assert.equal(nextDocumentRetry(dailyQuota, {}), null);
});
