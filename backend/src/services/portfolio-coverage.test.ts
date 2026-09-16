import assert from 'node:assert/strict';
import test from 'node:test';
import { extractCommercialModels, rankPortfolioCoverageGaps, summarizePortfolioCoverage } from './portfolio-coverage';

test('extrai múltiplos modelos de aplicação comercial sem tratar a planilha como prova técnica', () => {
  assert.deepEqual(extractCommercialModels('ROC.236R/143RII'), ['236R', '143RII']);
  assert.deepEqual(extractCommercialModels('ROC.226R/236R/143RII/362M18_K3'), ['226R', '236R', '143RII', '362M18_K3']);
});

test('preserva modelos com prefixo separado e remove data da aplicação', () => {
  assert.deepEqual(extractCommercialModels('TRATOR GT52XLSi'), ['GT52XLSi']);
  assert.deepEqual(extractCommercialModels('143RII - 12/2017'), ['143RII']);
  assert.deepEqual(extractCommercialModels('Z 248F'), ['Z248F']);
});

test('resumo de cobertura diferencia IPL local, Portal e lacuna', () => {
  const summary = summarizePortfolioCoverage([
    { model: '143RII', normalizedModel: '143RII', status: 'LOCAL_IPL', source: '143RII.pdf', pnc: null, commercialSignals: 5 },
    { model: 'Z460', normalizedModel: 'Z460', status: 'PORTAL_IPL', source: 'Portal', pnc: '967984601', commercialSignals: 3 },
    { model: 'MODELOX', normalizedModel: 'MODELOX', status: 'UNVERIFIED', source: null, pnc: null, commercialSignals: 1 },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.covered, 2);
  assert.equal(summary.coverageRate, 2 / 3);
});

test('prioriza lacunas com mais sinais comerciais sem misturar modelos já cobertos', () => {
  const gaps = rankPortfolioCoverageGaps([
    { model: '143RII', normalizedModel: '143RII', status: 'LOCAL_IPL', source: '143RII.pdf', pnc: null, commercialSignals: 20 },
    { model: 'Z248F', normalizedModel: 'Z248F', status: 'UNVERIFIED', source: null, pnc: null, commercialSignals: 8 },
    { model: 'LC353AWD', normalizedModel: 'LC353AWD', status: 'UNVERIFIED', source: null, pnc: null, commercialSignals: 12 },
    { model: '125B', normalizedModel: '125B', status: 'PORTAL_IPL', source: 'Portal', pnc: '952711902', commercialSignals: 30 },
  ], 2);

  assert.deepEqual(gaps, [
    { model: 'LC353AWD', normalizedModel: 'LC353AWD', commercialSignals: 12 },
    { model: 'Z248F', normalizedModel: 'Z248F', commercialSignals: 8 },
  ]);
});
