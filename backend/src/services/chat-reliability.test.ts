import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFallbackIntent, calibrateMatchConfidence, chooseCandidateLocally, extractLikelyPartNumber, lexicalSearchTerms } from './chat-reliability';

test('identifica código formatado sem confundir modelo curto', () => {
  assert.equal(extractLikelyPartNumber('Preciso da peça 537 04 19-01 da roçadeira'), '537 04 19-01');
  assert.equal(extractLikelyPartNumber('carburador da 143RS'), '');
  assert.equal(extractLikelyPartNumber('PNC 967 33 26-01'), '');
  assert.equal(extractLikelyPartNumber('consultar 503123401'), '503123401');
});

test('cria intenção segura quando o serviço generativo está indisponível', () => {
  const intent = buildFallbackIntent('filtro de ar do equipamento 143RS');
  assert.equal(intent.partDescription, 'filtro de ar do equipamento 143RS');
  assert.equal(intent.model, '');
  assert.equal(intent.partNumber, '');
});

test('remove palavras de apoio da busca textual de contingência', () => {
  assert.deepEqual(lexicalSearchTerms('Preciso de um filtro de ar para a máquina'), ['filtro']);
});

test('seleciona localmente apenas quando existe vantagem textual clara', () => {
  const candidates = [
    { id: 'filter', name: 'Filtro de ar', model: '143RS', pnc: null, section: 'Admissão', position: '1', aliases: ['elemento filtrante'] },
    { id: 'fuel', name: 'Filtro de combustível', model: '143RS', pnc: null, section: 'Tanque', position: '2', aliases: [] },
  ];

  assert.deepEqual(chooseCandidateLocally('elemento filtrante de ar', candidates).id, 'filter');
  assert.equal(chooseCandidateLocally('filtro', candidates).ambiguous, true);
});

test('calibra a confiança pelo elo técnico mais fraco', () => {
  assert.equal(calibrateMatchConfidence(0.92, 0.2), 0.8);
  assert.equal(calibrateMatchConfidence(0.7, 0.1), 0.7);
  assert.equal(calibrateMatchConfidence(0.3, 0.9, true), 1);
});
