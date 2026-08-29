import assert from 'node:assert/strict';
import test from 'node:test';
import { readableProcessingError } from './processing-error';

const dailyQuota = {
    error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'You exceeded your current quota.',
        details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }],
    },
};

test('explica cota diária sem expor JSON bruto', () => {
    const message = readableProcessingError(dailyQuota, false);
    assert.match(message, /cota diária/i);
    assert.match(message, /PDF original foi preservado/i);
    assert.doesNotMatch(message, /RESOURCE_EXHAUSTED|quotaId|\{"error"/i);
});

test('explica 503 como indisponibilidade temporária quando haverá retry', () => {
    const message = readableProcessingError({ error: { code: 503, status: 'UNAVAILABLE', message: 'high demand' } }, false, true);
    assert.match(message, /nova tentativa automática/i);
    assert.match(message, /não é necessário reenviar o PDF/i);
});

test('avisa quando as tentativas temporárias acabaram sem perder o PDF', () => {
    const message = readableProcessingError({ status: 503 }, false, false);
    assert.match(message, /após as tentativas automáticas/i);
    assert.match(message, /PDF foi preservado/i);
});
