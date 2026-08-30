import assert from 'node:assert/strict';
import test from 'node:test';
import { assessCatalogHealth, countLikelyMissingPositions, type CatalogHealthPart } from './catalog-health';

function part(page:number, position:number):CatalogHealthPart {
  return {
    model:'321R', normalizedModel:'321R', pnc:null, normalizedPnc:null, universalAcrossPnc:true,
    page, section:'Peças', position:String(position), name:`Peça ${position}`, notes:null,
    normalizedPartNumber:`58982${String(page).padStart(2,'0')}${String(position).padStart(2,'0')}`,
  };
}

test('detecta exatamente as três lacunas observadas na 321R', () => {
  const page17 = Array.from({length:13},(_,index)=>index+1).filter(position=>position!==8).map(position=>part(17,position));
  const page19 = Array.from({length:10},(_,index)=>index+1).filter(position=>position!==3&&position!==6).map(position=>part(19,position));
  assert.equal(countLikelyMissingPositions([...page17,...page19]), 3);

  const health = assessCatalogHealth({
    manufacturer:'Husqvarna', model:'321R', pnc:null,
    partCount:81, partsWithPage:81, partsWithSection:81, partsWithPosition:81,
    partsWithInformativeSection:0, chunkCount:10, embeddedPartCount:81,
    missingPositionCount:3, extractionMethod:'HUSQVARNA_IPL_TEXT', processingStage:'READY', category:'Roçadeiras',
  });
  assert.equal(health.reviewStatus, 'NEEDS_REVIEW');
  assert.ok(health.score < 100);
  assert.match(health.reasons.join(' '), /3 posição\(ões\).*ausentes/i);
});

test('não acusa listas KEY/PART deliberadamente esparsas', () => {
  const sparse = [1,2,17,20,21,24,38,46,47,50].map(position=>part(1,position));
  assert.equal(countLikelyMissingPositions(sparse), 0);
});
