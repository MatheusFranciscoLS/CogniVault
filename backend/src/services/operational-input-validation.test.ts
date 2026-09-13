import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_OPERATIONAL_PART_CODE_LENGTH,
    MAX_OPERATIONAL_PART_ID_LENGTH,
    parseOperationalPartCode,
    parseOptionalOperationalPartId,
    parseQuoteUsageItems,
} from './operational-input-validation';

test('operational part codes accept normal formatting and reject oversized or non-string values', () => {
    assert.equal(parseOperationalPartCode('  587 106 7-01  '), '587106701');
    assert.equal(parseOperationalPartCode('A-B_123'), 'AB123');
    assert.equal(parseOperationalPartCode('9'.repeat(MAX_OPERATIONAL_PART_CODE_LENGTH + 1)), null);
    assert.equal(parseOperationalPartCode(587106701), null);
    assert.equal(parseOperationalPartCode({ code: '587106701' }), null);
});

test('optional operational part id rejects malformed and oversized identifiers', () => {
    assert.deepEqual(parseOptionalOperationalPartId(undefined), { valid: true, value: '' });
    assert.deepEqual(parseOptionalOperationalPartId(' part-123 '), { valid: true, value: 'part-123' });
    assert.equal(parseOptionalOperationalPartId('x'.repeat(MAX_OPERATIONAL_PART_ID_LENGTH + 1)).valid, false);
    assert.equal(parseOptionalOperationalPartId(123).valid, false);
});

test('quote usage validates every supplied part code instead of silently dropping bad items', () => {
    const valid = parseQuoteUsageItems([
        { partNumber: '587 106 7-01', model: '143RII' },
        { partNumber: '503-80-83-03', model: null },
    ]);

    assert.ok(valid);
    assert.deepEqual(valid.map(item => item.partNumber), ['587106701', '503808303']);
    assert.equal(parseQuoteUsageItems([{ partNumber: '9'.repeat(MAX_OPERATIONAL_PART_CODE_LENGTH + 1) }]), null);
    assert.equal(parseQuoteUsageItems([{ partNumber: 587106701 }]), null);
    assert.equal(parseQuoteUsageItems([null]), null);
});
