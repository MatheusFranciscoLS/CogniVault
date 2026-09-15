import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_VERIFICATION_BATCH_CODES,
  MAX_VERIFICATION_CODE_LENGTH,
  parseOptionalVerificationText,
  parseRequiredVerificationCode,
  parseVerificationCodesQuery,
} from './verification-input-validation';

test('verification code batch accepts bounded text and rejects structured or oversized values', () => {
  assert.deepEqual(parseVerificationCodesQuery('503808302, 503808303,503808302'), ['503808302', '503808303']);
  assert.deepEqual(parseVerificationCodesQuery(undefined), []);
  assert.equal(parseVerificationCodesQuery(['503808302']), null);
  assert.equal(parseVerificationCodesQuery('9'.repeat(MAX_VERIFICATION_CODE_LENGTH + 1)), null);
  assert.equal(parseVerificationCodesQuery(Array.from({ length: MAX_VERIFICATION_BATCH_CODES + 1 }, (_, i) => `50380${String(i).padStart(4, '0')}`).join(',')), null);
});

test('verification submission codes require real bounded strings', () => {
  assert.equal(parseRequiredVerificationCode(' 503 808 302 '), '503 808 302');
  assert.equal(parseRequiredVerificationCode({ code: '503808302' }), null);
  assert.equal(parseRequiredVerificationCode('x'.repeat(MAX_VERIFICATION_CODE_LENGTH + 1)), null);
  assert.equal(parseRequiredVerificationCode('---'), null);
});

test('verification optional text does not silently coerce objects or oversized values', () => {
  assert.deepEqual(parseOptionalVerificationText(undefined, 500), { valid: true, value: null });
  assert.deepEqual(parseOptionalVerificationText(' observação ', 500), { valid: true, value: 'observação' });
  assert.equal(parseOptionalVerificationText({ text: 'observação' }, 500).valid, false);
  assert.equal(parseOptionalVerificationText('x'.repeat(501), 500).valid, false);
});
