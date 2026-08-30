import assert from 'node:assert/strict';
import test from 'node:test';
import { reconciledCatalogModel } from './catalog-metadata-reconciliation';

test('corrige modelo antigo quando todas as peças extraídas concordam',()=>{
  assert.equal(reconciledCatalogModel({storedModel:'assy 321S',metadataReviewedAt:null,partModels:['321R','321R','321R']}),'321R');
});

test('não sobrescreve modelo confirmado manualmente pelo administrador',()=>{
  assert.equal(reconciledCatalogModel({storedModel:'321R confirmado',metadataReviewedAt:new Date(),partModels:['321R']}),'321R confirmado');
});

test('não adivinha quando as peças contêm mais de um modelo',()=>{
  assert.equal(reconciledCatalogModel({storedModel:'TS 142',metadataReviewedAt:null,partModels:['TS 142','TS 142T']}),'TS 142');
});