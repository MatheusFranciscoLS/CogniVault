import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSearchQualityRadar } from './search-quality-radar';

test('agrupa recorrências equivalentes e prioriza as mais frequentes', () => {
  const radar = buildSearchQualityRadar([
    { query: 'Qual o código da embreagem da 143RII?', pnc: null, status: 'AMBIGUOUS', createdAt: '2026-08-29T01:00:00Z' },
    { query: 'Qual o código da embreagem da 143RII ?', pnc: null, status: 'AMBIGUOUS', createdAt: '2026-08-29T02:00:00Z' },
    { query: 'Carburador da 143RII', pnc: null, status: 'NOT_FOUND', createdAt: '2026-08-29T03:00:00Z' },
  ]);

  assert.equal(radar.length, 2);
  assert.equal(radar[0].count, 2);
  assert.equal(radar[0].status, 'AMBIGUOUS');
  assert.equal(radar[0].model, '143RII');
});

test('remove do radar uma consulta cujo evento mais recente foi FOUND', () => {
  const radar = buildSearchQualityRadar([
    { query: 'carburador da 143RII', pnc: '967332904', status: 'AMBIGUOUS', createdAt: '2026-08-29T01:00:00Z' },
    { query: 'carburador da 143RII', pnc: '967332904', status: 'FOUND', createdAt: '2026-08-29T02:00:00Z' },
  ]);

  assert.deepEqual(radar, []);
});

test('mantém no radar quando a falha voltou a ocorrer depois de um acerto', () => {
  const radar = buildSearchQualityRadar([
    { query: 'filtro da máquina 143RII', pnc: null, status: 'FOUND', createdAt: '2026-08-29T01:00:00Z' },
    { query: 'filtro da máquina 143RII', pnc: null, status: 'NOT_FOUND', createdAt: '2026-08-29T02:00:00Z' },
  ]);

  assert.equal(radar.length, 1);
  assert.equal(radar[0].status, 'NOT_FOUND');
  assert.equal(radar[0].count, 1);
});

test('separa a mesma consulta por PNC quando a aplicação é diferente', () => {
  const radar = buildSearchQualityRadar([
    { query: 'correia do LC 151S', pnc: '970488401', status: 'NOT_FOUND', createdAt: '2026-08-29T01:00:00Z' },
    { query: 'correia do LC 151S', pnc: '970488402', status: 'NOT_FOUND', createdAt: '2026-08-29T02:00:00Z' },
  ]);

  assert.equal(radar.length, 2);
  assert.deepEqual(new Set(radar.map(item => item.pnc)), new Set(['970488401', '970488402']));
});
