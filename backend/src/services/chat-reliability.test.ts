import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFallbackIntent, calibrateMatchConfidence, chooseCandidateLocally, extractLikelyModel, extractLikelyPartNumber, extractLikelyPnc, lexicalSearchTerms } from './chat-reliability';
import { buildSearchGroups, scorePartText } from './part-vocabulary';

test('identifica código formatado sem confundir modelo curto', () => {
  assert.equal(extractLikelyPartNumber('Preciso da peça 537 04 19-01 da roçadeira'), '537 04 19-01');
  assert.equal(extractLikelyPartNumber('carburador da 143RS'), '');
  assert.equal(extractLikelyPartNumber('PNC 967 33 26-01'), '');
  assert.equal(extractLikelyPartNumber('consultar 503123401'), '503123401');
});

test('cria intenção segura quando o serviço generativo está indisponível', () => {
  const intent = buildFallbackIntent('filtro de ar do equipamento 143RS');
  assert.equal(intent.partDescription, 'filtro de ar do equipamento 143RS');
  assert.equal(intent.model, '143RS');
  assert.equal(intent.partNumber, '');
});

test('extrai modelo, fabricante e PNC localmente sem depender da IA', () => {
  const intent = buildFallbackIntent('Qual o código do carburado de Husqvarna 143 R II?');
  assert.equal(intent.manufacturer, 'Husqvarna');
  assert.equal(intent.model, '143RII');
  assert.equal(extractLikelyModel('carburador da 143rii'), '143rii');
  assert.equal(extractLikelyPnc('consultar PNC 967 33 26-01'), '967 33 26-01');
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

test('traduz vocabulário de balcão e tolera erro de digitação', () => {
  const carburettor = buildSearchGroups('Qual o carburado da Husqvarna 143RII?', ['Husqvarna', '143RII']);
  assert.ok(carburettor.some(group => group.variants.includes('carburettor')));

  const airFilter = buildSearchGroups('filtro de ar da 143RII', ['143RII']);
  assert.ok(airFilter.some(group => group.variants.includes('airfilter')));

  assert.ok(scorePartText('carburador', { name: 'Carburettor', section: 'Intake' }) > scorePartText('carburador', { name: 'Screw', section: 'Carburettor' }));
});

test('seleciona a peça inglesa exata em vez de componentes da mesma seção', () => {
  const candidates = [
    { id: 'carb', name: 'Carburettor', model: '143RII', pnc: null, section: 'Intake', position: '1', aliases: [] },
    { id: 'screw', name: 'Screw', model: '143RII', pnc: null, section: 'Carburettor', position: '15', aliases: [] },
  ];
  assert.deepEqual(chooseCandidateLocally('carburado da 143RII', candidates), { id: 'carb', confidence: 0.9, ambiguous: false });
});

test('calibra a confiança pelo elo técnico mais fraco', () => {
  assert.equal(calibrateMatchConfidence(0.92, 0.2), 0.8);
  assert.equal(calibrateMatchConfidence(0.7, 0.1), 0.7);
  assert.equal(calibrateMatchConfidence(0.3, 0.9, true), 1);
});
