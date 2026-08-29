import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFallbackIntent,
  extractLikelyModel,
  extractLikelyPartNumber,
  extractLikelyPnc,
} from './chat-reliability';
import { evaluateAnswerConfidence } from './confidence-gate';
import type { PartCandidate } from './part-search.service';

function candidate(overrides: Partial<PartCandidate>): PartCandidate {
  return {
    id: 'candidate',
    documentId: 'doc',
    filename: 'LB256SP.pdf',
    manufacturer: 'Husqvarna',
    model: 'LB256SP',
    normalizedModel: 'LB256SP',
    pnc: '970488501',
    normalizedPnc: '970488501',
    universalAcrossPnc: false,
    section: 'CUTTING EQUIPMENT',
    position: '6',
    name: 'SUPORTE DA LÂMINA BLADE ADAPTER Ø25 mm',
    alternativeNames: [],
    partNumber: '529595002',
    normalizedPartNumber: '529595002',
    page: 6,
    notes: 'For PNC 970488501 From S/N: 20240200001, For PNC 970488502 From S/N: 20241400001',
    distance: 0.25,
    feedbackScore: 0,
    searchMethod: 'LEXICAL',
    retrievalScore: 0.8,
    retrievalSources: ['LEXICAL', 'FULL_TEXT'],
    retrievalAgreement: 2,
    ...overrides,
  };
}

test('serial e PNC contínuo não são tratados como Part Number e não escondem o modelo', () => {
  const question = 'adaptador da lâmina LB256SP PNC: 970488501 S/N 20240200001';
  assert.equal(extractLikelyPartNumber(question), '');
  assert.equal(extractLikelyPnc(question), '970488501');
  assert.equal(extractLikelyModel(question).toUpperCase(), 'LB256SP');
  const intent = buildFallbackIntent(question);
  assert.equal(intent.partNumber, '');
  assert.equal(intent.pnc, '970488501');
  assert.equal(intent.model.toUpperCase(), 'LB256SP');
});

test('serial incompatível bloqueia liberação mesmo com recuperação forte', () => {
  const oldVariant = candidate({
    id: 'old',
    name: 'SUPORTE DA LÂMINA BLADE ADAPTER Ø22 mm',
    partNumber: '529595001',
    normalizedPartNumber: '529595001',
    notes: 'For PNC 970488501 Up to S/N:20240200000, For PNC 970488502 Up to S/N:20241400000',
  });
  const decision = evaluateAnswerConfidence({
    question: 'adaptador da lâmina LB256SP PNC 970488501 S/N 20240200001',
    chosen: oldVariant,
    selectionConfidence: 0.9,
    catalog: { healthScore: 96, reviewStatus: 'READY' },
  });
  assert.equal(decision.safe, false);
  assert.ok(decision.evidence.some(item => item.includes('número de série')));
});

test('serial dentro da faixa vira evidência técnica explícita', () => {
  const newVariant = candidate({ id: 'new' });
  const oldVariant = candidate({
    id: 'old',
    name: 'SUPORTE DA LÂMINA BLADE ADAPTER Ø22 mm',
    partNumber: '529595001',
    normalizedPartNumber: '529595001',
    notes: 'For PNC 970488501 Up to S/N:20240200000, For PNC 970488502 Up to S/N:20241400000',
    retrievalScore: 0.8,
  });
  const decision = evaluateAnswerConfidence({
    question: 'adaptador da lâmina LB256SP PNC 970488501 S/N 20240200001',
    chosen: newVariant,
    runnerUp: oldVariant,
    selectionConfidence: 0.9,
    catalog: { healthScore: 96, reviewStatus: 'READY' },
  });
  assert.equal(decision.safe, true);
  assert.ok(decision.evidence.some(item => item.includes('faixa explicitamente indicada')));
});
