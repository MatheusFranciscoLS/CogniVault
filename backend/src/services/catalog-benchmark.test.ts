import assert from 'node:assert/strict';
import test from 'node:test';
import { selectCatalogBenchmarkCases } from './catalog-benchmark';

function row(id: string, family: string, model: string, name: string, code: string, extras: Record<string, unknown> = {}) {
  return {
    id,
    name,
    partNumber: code,
    normalizedPartNumber: code.replace(/\D/g, ''),
    model,
    normalizedModel: model.replace(/\W/g, '').toUpperCase(),
    pnc: null,
    normalizedPnc: null,
    section: 'MOTOR',
    position: id,
    page: 3,
    document: { filename: `${model}.pdf`, category: { name: family } },
    ...extras,
  };
}

test('benchmark de catálogo distribui famílias e mantém fonte exata', () => {
  const rows = [
    row('1', 'Motosserras', '372XP', 'PISTÃO', '503000001'),
    row('2', 'Motosserras', '353', 'BOBINA', '503000002'),
    row('3', 'Giro zero', 'Z460', 'CORREIA', '503000003'),
    row('4', 'Giro zero', 'Z254', 'LÂMINA', '503000004'),
  ];
  const cases = selectCatalogBenchmarkCases(rows, 4);
  assert.equal(cases.length, 4);
  assert.deepEqual(new Set(cases.map(item => item.family)), new Set(['Motosserras', 'Giro zero']));
  assert.ok(cases.every(item => item.source.includes('.pdf') && item.source.includes('pos.')));
});

test('benchmark descarta evidência que aponta para mais de um Part Number', () => {
  const base = row('10', 'Roçadeiras', '143RII', 'CARBURADOR', '587106701', { position: '15' });
  const conflicting = { ...base, id: '11', partNumber: '586931401', normalizedPartNumber: '586931401' };
  const cases = selectCatalogBenchmarkCases([base, conflicting], 10);
  assert.equal(cases.length, 0);
});

test('benchmark não aceita código ou metadado técnico fraco', () => {
  const invalidCode = row('20', 'Sopradores', '125B', 'FILTRO', 'ABC');
  const invalidModel = row('21', 'Sopradores', '', 'FILTRO', '545112101');
  assert.equal(selectCatalogBenchmarkCases([invalidCode, invalidModel], 10).length, 0);
});
