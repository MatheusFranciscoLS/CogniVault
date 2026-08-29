import assert from 'node:assert/strict';
import test from 'node:test';
import { getVerifiedSupersession, preferCurrentPartNumbers, resolveCurrentPartNumber } from './part-supersession';

test('redireciona o carburador antigo para o código atual confirmado pela Husqvarna', () => {
  assert.equal(resolveCurrentPartNumber('586 93 14-01'), '587106701');
  assert.equal(getVerifiedSupersession('586931401')?.sourceUrl.includes('portal.husqvarnagroup.com/br/'), true);
});

test('oculta a peça substituída somente quando a atual também está no catálogo', () => {
  const oldPart = { id: 'old', partNumber: '586931401', normalizedPartNumber: '586931401' };
  const currentPart = { id: 'current', partNumber: '587106701', normalizedPartNumber: '587106701' };
  assert.deepEqual(preferCurrentPartNumbers([oldPart, currentPart]).map(item => item.id), ['current']);
  assert.deepEqual(preferCurrentPartNumbers([oldPart]).map(item => item.id), ['old']);
});
