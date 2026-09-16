import assert from 'node:assert/strict';
import test from 'node:test';
import { extractCommercialModels, hasStrongCommercialModelShape, rankPortfolioCoverageGaps, summarizePortfolioCoverage } from './portfolio-coverage';

test('extrai múltiplos modelos de aplicação comercial sem tratar a planilha como prova técnica', () => {
  assert.deepEqual(extractCommercialModels('ROC.236R/143RII'), ['236R', '143RII']);
  assert.deepEqual(extractCommercialModels('ROC.226R/236R/143RII/362M18_K3'), ['226R', '236R', '143RII', '362M18_K3']);
});

test('preserva modelos com prefixo separado e remove data da aplicação', () => {
  assert.deepEqual(extractCommercialModels('TRATOR GT52XLSi'), ['GT52XLSi']);
  assert.deepEqual(extractCommercialModels('143RII - 12/2017'), ['143RII']);
  assert.deepEqual(extractCommercialModels('Z 248F'), ['Z248F']);
});

test('não promove abreviações encadeadas do cadastro comercial a modelos completos', () => {
  assert.deepEqual(extractCommercialModels('323R/LD/5/7LDx/HE/P5x'), ['323R']);
  assert.deepEqual(extractCommercialModels('325HE3x/HE4x/325P5x/327P5x'), ['325HE3x', '325P5x', '327P5x']);
  assert.deepEqual(extractCommercialModels('CTH160/36A/LT125B/151/P12597'), ['CTH160', 'LT125B', 'P12597']);

  assert.equal(hasStrongCommercialModelShape('3R'), false);
  assert.equal(hasStrongCommercialModelShape('P5X'), false);
  assert.equal(hasStrongCommercialModelShape('7LDX'), false);
  assert.equal(hasStrongCommercialModelShape('GT52XLSi'), true);
  assert.equal(hasStrongCommercialModelShape('143RII'), true);
});

test('preserva modelos completos antigos encontrados na homologação comercial', () => {
  assert.deepEqual(extractCommercialModels('CRT51/LT125B/LT151/1597/P12597'), ['CRT51', 'LT125B', 'LT151', 'P12597']);
  assert.deepEqual(extractCommercialModels('J55S (02/03/04/05/06)/SL/XT722'), ['J55S', 'XT722']);
  assert.deepEqual(extractCommercialModels('W3612/3/4814/5/iZ4821T/LZ6125T'), ['W3612', 'iZ4821T', 'LZ6125T']);
});

test('resumo de cobertura diferencia IPL local, Portal e lacuna', () => {
  const summary = summarizePortfolioCoverage([
    { model: '143RII', normalizedModel: '143RII', status: 'LOCAL_IPL', source: '143RII.pdf', pnc: null, commercialSignals: 5, commercialEvidence: ['ROC.143RII'] },
    { model: 'Z460', normalizedModel: 'Z460', status: 'PORTAL_IPL', source: 'Portal', pnc: '967984601', commercialSignals: 3, commercialEvidence: ['Z460'] },
    { model: 'MODELOX', normalizedModel: 'MODELOX', status: 'UNVERIFIED', source: null, pnc: null, commercialSignals: 1, commercialEvidence: ['MODELOX'] },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.covered, 2);
  assert.equal(summary.coverageRate, 2 / 3);
});

test('prioriza lacunas com mais sinais comerciais e preserva evidência para homologação', () => {
  const gaps = rankPortfolioCoverageGaps([
    { model: '143RII', normalizedModel: '143RII', status: 'LOCAL_IPL', source: '143RII.pdf', pnc: null, commercialSignals: 20, commercialEvidence: ['ROC.143RII'] },
    { model: 'Z248F', normalizedModel: 'Z248F', status: 'UNVERIFIED', source: null, pnc: null, commercialSignals: 8, commercialEvidence: ['TRATOR Z 248F'] },
    { model: 'LC353AWD', normalizedModel: 'LC353AWD', status: 'UNVERIFIED', source: null, pnc: null, commercialSignals: 12, commercialEvidence: ['LC353AWD/LC353V'] },
    { model: '125B', normalizedModel: '125B', status: 'PORTAL_IPL', source: 'Portal', pnc: '952711902', commercialSignals: 30, commercialEvidence: ['125B'] },
  ], 2);

  assert.deepEqual(gaps, [
    { model: 'LC353AWD', normalizedModel: 'LC353AWD', status: 'UNVERIFIED', commercialSignals: 12, commercialEvidence: ['LC353AWD/LC353V'] },
    { model: 'Z248F', normalizedModel: 'Z248F', status: 'UNVERIFIED', commercialSignals: 8, commercialEvidence: ['TRATOR Z 248F'] },
  ]);
});
