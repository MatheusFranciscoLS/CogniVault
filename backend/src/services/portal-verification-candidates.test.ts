import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPortalVerificationCandidates } from './portal-verification-candidates';

const items = [
  { model: '143RII', normalizedModel: '143RII', status: 'LOCAL_IPL' as const, commercialSignals: 100 },
  { model: '445E', normalizedModel: '445E', status: 'UNVERIFIED' as const, commercialSignals: 29 },
  { model: '323R', normalizedModel: '323R', status: 'UNVERIFIED' as const, commercialSignals: 59 },
  { model: 'P12597', normalizedModel: 'P12597', status: 'UNVERIFIED' as const, commercialSignals: 74 },
  { model: 'LT151', normalizedModel: 'LT151', status: 'UNVERIFIED' as const, commercialSignals: 64 },
  { model: 'Z460', normalizedModel: 'Z460', status: 'PORTAL_IPL' as const, commercialSignals: 90 },
  { model: 'AAA1', normalizedModel: 'AAA1', status: 'UNVERIFIED' as const, commercialSignals: 10 },
  { model: 'AAA2', normalizedModel: 'AAA2', status: 'UNVERIFIED' as const, commercialSignals: 10 },
];

test('limita homologação do Portal BR às maiores lacunas sem promover modelos já cobertos', () => {
  const selected = selectPortalVerificationCandidates(items, 3);
  assert.deepEqual(selected.map(item => item.normalizedModel), ['P12597', 'LT151', '323R']);
});

test('desempata de forma determinística e não altera a lista original', () => {
  const snapshot = items.map(item => item.normalizedModel);
  const selected = selectPortalVerificationCandidates(items, 8);

  assert.deepEqual(selected.slice(-2).map(item => item.normalizedModel), ['AAA1', 'AAA2']);
  assert.deepEqual(items.map(item => item.normalizedModel), snapshot);
});

test('limite inválido ou não positivo não dispara homologação', () => {
  assert.deepEqual(selectPortalVerificationCandidates(items, 0), []);
  assert.deepEqual(selectPortalVerificationCandidates(items, -3), []);
  assert.deepEqual(selectPortalVerificationCandidates(items, Number.NaN), []);
});
