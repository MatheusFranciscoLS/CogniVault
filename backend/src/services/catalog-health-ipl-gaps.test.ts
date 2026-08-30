import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessCatalogHealth,
  countLikelyMissingPositions,
  diagnoseCatalogStructure,
  isSuspiciousCatalogModel,
  type CatalogHealthPart,
} from './catalog-health';

function part(page:number, position:string): CatalogHealthPart {
  return {
    model:'321R', normalizedModel:'321R', pnc:null, normalizedPnc:null,
    universalAcrossPnc:true, page, section:page===17?'CRANKCASE & CLUTCHDRUM':'STARTER',
    position, name:`PEÇA ${position}`, notes:null, normalizedPartNumber:`59021${page}${position.padStart(2,'0')}`,
  };
}

test('321R sparse official callouts are not treated as missing parts', () => {
  const parts = [
    ...['1','2','3','4','5','6','7','9','10','11','12','13'].map(position=>part(17,position)),
    ...['1','2','4','5','7','8','9','10'].map(position=>part(19,position)),
  ];
  assert.equal(countLikelyMissingPositions(parts),0);
  const diagnostics=diagnoseCatalogStructure(parts,'321R',null);
  assert.equal(diagnostics.missingPositionCount,0);
  assert.equal(diagnostics.conflictingOccurrenceCount,0);
});

test('health trusts persisted table rows instead of the highest callout number', () => {
  const result=assessCatalogHealth({
    manufacturer:'Husqvarna', model:'321R', extractedModels:['321R'],
    snapshotPartCount:81, partCount:81, partsWithPage:81, partsWithSection:81,
    partsWithInformativeSection:81, partsWithPosition:81, chunkCount:10,
    embeddedPartCount:0, extractionMethod:'HUSQVARNA_IPL_TEXT', processingStage:'READY',
    category:'Roçadeiras', missingPositionCount:3,
  });
  assert.equal(result.reviewStatus,'READY');
  assert.equal(result.score,100);
  assert.ok(!result.reasons.some(reason=>reason.includes('posição')));
});

test('assembly/application prose cannot masquerade as a 100 percent catalog model', () => {
  assert.equal(isSuspiciousCatalogModel('assy 321S'),true);
  assert.equal(isSuspiciousCatalogModel('321R'),false);
  const result=assessCatalogHealth({
    manufacturer:'Husqvarna', model:'assy 321S', extractedModels:['assy 321S'],
    snapshotPartCount:81, partCount:81, partsWithPage:81, partsWithSection:81,
    partsWithInformativeSection:0, partsWithPosition:81, chunkCount:10,
    embeddedPartCount:0, extractionMethod:'HUSQVARNA_IPL_TEXT', processingStage:'READY',
    category:'Roçadeiras',
  });
  assert.equal(result.reviewStatus,'NEEDS_REVIEW');
  assert.ok(result.score<100);
  assert.ok(result.reasons.some(reason=>reason.includes('assembly')));
});
