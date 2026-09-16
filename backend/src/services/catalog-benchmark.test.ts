import assert from 'node:assert/strict';
import test from 'node:test';
import { benchmarkCoverageByModel, selectCatalogBenchmarkCases } from './catalog-benchmark';

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

test('benchmark roda modelos da mesma família antes de repetir o primeiro modelo', () => {
  const rows = [
    row('10', 'Tratores', 'TS114', 'FILTRO A', '503100001'),
    row('11', 'Tratores', 'TS114', 'FILTRO B', '503100002'),
    row('12', 'Tratores', 'TS114', 'FILTRO C', '503100003'),
    row('13', 'Tratores', 'TS217TM', 'CORREIA A', '503100004'),
    row('14', 'Tratores', 'TS217TM', 'CORREIA B', '503100005'),
    row('15', 'Tratores', 'TS354XD', 'LÂMINA A', '503100006'),
  ];

  const cases = selectCatalogBenchmarkCases(rows, 3);
  assert.equal(cases.length, 3);
  assert.deepEqual(new Set(cases.map(item => item.model)), new Set(['TS114', 'TS217TM', 'TS354XD']));
  assert.deepEqual(benchmarkCoverageByModel(cases).map(item => item.model).sort(), ['TS114', 'TS217TM', 'TS354XD']);
});

test('benchmark descarta evidência que aponta para mais de um Part Number', () => {
  const base = row('20', 'Roçadeiras', '143RII', 'CARBURADOR', '587106701', { position: '15' });
  const conflicting = { ...base, id: '21', partNumber: '586931401', normalizedPartNumber: '586931401' };
  const cases = selectCatalogBenchmarkCases([base, conflicting], 10);
  assert.equal(cases.length, 0);
});

test('benchmark não aceita código ou metadado técnico fraco', () => {
  const invalidCode = row('30', 'Sopradores', '125B', 'FILTRO', 'ABC');
  const invalidModel = row('31', 'Sopradores', '', 'FILTRO', '545112101');
  assert.equal(selectCatalogBenchmarkCases([invalidCode, invalidModel], 10).length, 0);
});