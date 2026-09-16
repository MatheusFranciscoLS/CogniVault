import assert from 'node:assert/strict';
import test from 'node:test';
import { extractCommercialModels, summarizePortfolioCoverage } from './portfolio-coverage';

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
    { model: '143RII', normalizedModel: '143RII', status: 'LOCAL_IPL', source: '143RII.pdf', pnc: null },
    { model: 'Z460', normalizedModel: 'Z460', status: 'PORTAL_IPL', source: 'Portal', pnc: '967984601' },
    { model: 'MODELOX', normalizedModel: 'MODELOX', status: 'UNVERIFIED', source: null, pnc: null },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.covered, 2);
  assert.equal(summary.coverageRate, 2 / 3);
});
