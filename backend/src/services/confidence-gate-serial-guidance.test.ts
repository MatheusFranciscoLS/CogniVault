import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAnswerConfidence } from './confidence-gate';
import type { PartCandidate } from './part-search.service';

function adapter(overrides:Partial<PartCandidate>={}):PartCandidate {
  return {
    id:'old',documentId:'lb256',filename:'LB256SP.pdf',manufacturer:'Husqvarna',
    model:'LB 256SP',normalizedModel:'LB256SP',pnc:'970488501',normalizedPnc:'970488501',
    universalAcrossPnc:false,section:'CUTTING EQUIPMENT',position:'6',name:'BLADE ADAPTER Ø22 mm',
    alternativeNames:[],partNumber:'529595001',normalizedPartNumber:'529595001',page:12,
    notes:'For PNC 970488501 Up to S/N:20240200000',distance:0.08,feedbackScore:0,
    searchMethod:'LEXICAL',retrievalScore:0.92,retrievalSources:['LEXICAL','FULL_TEXT'],retrievalAgreement:2,
    ...overrides,
  };
}

test('does not release either code when the same occurrence changes by serial and S/N is missing',()=>{
  const result=evaluateAnswerConfidence({
    question:'adaptador da lâmina LB256SP PNC 970488501',
    chosen:adapter(),
    runnerUp:adapter({id:'new',name:'BLADE ADAPTER Ø25 mm',partNumber:'529595002',normalizedPartNumber:'529595002',notes:'For PNC 970488501 From S/N:20240200001',retrievalScore:0.88}),
    selectionConfidence:0.96,
    catalog:{healthScore:100,reviewStatus:'READY'},
  });
  assert.equal(result.safe,false);
  assert.ok(result.reason.includes('S/N'));
  assert.ok(result.evidence.some(item=>item.includes('faixas explícitas')));
});

test('serial inside the documented range can release the matching variant',()=>{
  const result=evaluateAnswerConfidence({
    question:'adaptador da lâmina LB256SP PNC 970488501 S/N 20240210000',
    chosen:adapter({id:'new',name:'BLADE ADAPTER Ø25 mm',partNumber:'529595002',normalizedPartNumber:'529595002',notes:'For PNC 970488501 From S/N:20240200001'}),
    runnerUp:adapter(),
    selectionConfidence:0.96,
    catalog:{healthScore:100,reviewStatus:'READY'},
  });
  assert.equal(result.safe,true);
  assert.ok(result.evidence.some(item=>item.includes('dentro da faixa')));
});
