import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadErrorResponse } from './upload-error-response';

test('multipart upload size violations return 413 with actionable messages', () => {
  assert.deepEqual(uploadErrorResponse('LIMIT_FILE_SIZE'), {
    status: 413,
    message: 'O PDF excede o limite de 50 MB.',
  });
  assert.deepEqual(uploadErrorResponse('LIMIT_FIELD_VALUE'), {
    status: 413,
    message: 'Um campo de metadados do upload excede 1 KB.',
  });
});

test('multipart structure violations return bounded 400 responses', () => {
  assert.equal(uploadErrorResponse('LIMIT_FILE_COUNT').status, 400);
  assert.equal(uploadErrorResponse('LIMIT_UNEXPECTED_FILE').status, 400);
  assert.equal(uploadErrorResponse('LIMIT_FIELD_COUNT').status, 400);
  assert.equal(uploadErrorResponse('LIMIT_PART_COUNT').status, 400);
  assert.equal(uploadErrorResponse('LIMIT_FIELD_KEY').status, 400);
  assert.deepEqual(uploadErrorResponse('UNKNOWN'), {
    status: 400,
    message: 'Não foi possível receber o arquivo enviado.',
  });
});
