import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCommercialApplicationModels, normalizePortfolioModel } from './portfolio-coverage.service';

test('extrai modelos compostos do cadastro comercial sem inflar cobertura', () => {
  assert.deepEqual(
    extractCommercialApplicationModels('ROC.226R/236R/143RII/ATOM.362M18_K3'),
    ['226R', '236R', '143RII', '362M18_K3'],
  );
});

test('remove ano e rótulos de família da aplicação', () => {
  assert.deepEqual(extractCommercialApplicationModels('ROC 236/143RII 2015'), ['236', '143RII']);
  assert.deepEqual(extractCommercialApplicationModels('TRATOR GT52XLSi'), ['GT52XLSi']);
});

test('descarta marcas genéricas e tokens sem identificação de modelo', () => {
  assert.deepEqual(extractCommercialApplicationModels('HONDA'), []);
  assert.deepEqual(extractCommercialApplicationModels('HS/6'), []);
});

test('normaliza prefixos de marca sem misturar modelos', () => {
  assert.equal(normalizePortfolioModel('HUSQVARNA 143RII'), '143RII');
  assert.equal(normalizePortfolioModel('143RII'), '143RII');
});
