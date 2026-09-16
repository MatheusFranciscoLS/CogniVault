import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyOfficialVariantCompatibility } from './official-variant-compatibility';

test('confirma aplicação ampla somente quando todas as variantes foram verificadas e contêm a mesma ocorrência', () => {
  const result = classifyOfficialVariantCompatibility({
    seedPnc: '967123401',
    variantPncs: ['967123401', '967123402', '967123403'],
    checkedPncs: ['967123401', '967123402', '967123403'],
    matchingPncs: ['967123401', '967123402', '967123403'],
    unresolvedPncs: [],
  });
  assert.equal(result.status, 'CONFIRMED_ALL_VARIANTS');
  assert.equal(result.missingPncs.length, 0);
});

test('marca como específica de variante quando a mesma ocorrência muda de código', () => {
  const result = classifyOfficialVariantCompatibility({
    seedPnc: '967123401',
    variantPncs: ['967123401', '967123402'],
    checkedPncs: ['967123401', '967123402'],
    matchingPncs: ['967123401'],
    unresolvedPncs: [],
  });
  assert.equal(result.status, 'VARIANT_SPECIFIC');
  assert.deepEqual(result.missingPncs, ['967123402']);
});

test('mais de um código na mesma ocorrência exige confirmação adicional', () => {
  const result = classifyOfficialVariantCompatibility({
    seedPnc: '967123401',
    variantPncs: ['967123401'],
    checkedPncs: ['967123401'],
    matchingPncs: ['967123401'],
    unresolvedPncs: [],
    multipleCodePncs: ['967123401'],
  });
  assert.equal(result.status, 'VARIANT_SPECIFIC');
  assert.deepEqual(result.multipleCodePncs, ['967123401']);
  assert.match(result.reason, /S\/N/i);
});

test('falha de consulta nunca vira ausência confirmada', () => {
  const result = classifyOfficialVariantCompatibility({
    seedPnc: '967123401',
    variantPncs: ['967123401', '967123402'],
    checkedPncs: ['967123401'],
    matchingPncs: ['967123401'],
    unresolvedPncs: ['967123402'],
  });
  assert.equal(result.status, 'INCONCLUSIVE');
  assert.deepEqual(result.missingPncs, []);
});

test('aceita variante única quando o próprio portal só expõe um artigo e a ocorrência contém a peça', () => {
  const result = classifyOfficialVariantCompatibility({
    seedPnc: '967123401',
    variantPncs: ['967123401'],
    checkedPncs: ['967123401'],
    matchingPncs: ['967123401'],
    unresolvedPncs: [],
  });
  assert.equal(result.status, 'SINGLE_VARIANT');
});
