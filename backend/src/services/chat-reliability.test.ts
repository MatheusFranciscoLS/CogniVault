import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFallbackIntent,
  calibrateMatchConfidence,
  chooseCandidateLocally,
  extractLikelyModel,
  extractLikelyPartNumber,
  extractLikelyPnc,
  extractLikelyPosition,
  lexicalSearchTerms,
} from './chat-reliability';
import {
  buildSearchGroups,
  focusCandidatesByDescription,
  inferPartQueryRelation,
  scorePartText,
  semanticQueryText,
} from './part-vocabulary';

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

test('extrai modelo, fabricante, PNC e posição localmente sem depender da IA', () => {
  const intent = buildFallbackIntent('Qual o código do parafuso posição 16 da embreagem de Husqvarna 143 R II?');
  assert.equal(intent.manufacturer, 'Husqvarna');
  assert.equal(intent.model, '143RII');
  assert.equal(intent.position, '16');
  assert.equal(extractLikelyModel('carburador da 143rii'), '143rii');
  assert.equal(extractLikelyPnc('consultar PNC 967 33 26-01'), '967 33 26-01');
  assert.equal(extractLikelyPosition('parafuso pos. 13 da embreagem'), '13');
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

test('usa correções acumuladas do balcão para desempatar descrições técnicas equivalentes', () => {
  const candidates = [
    { id: 'wrong', name: 'Carburettor', model: '143RII', pnc: null, section: 'Body', position: '1', aliases: [], feedbackScore: -0.08 },
    { id: 'right', name: 'Carburettor', model: '143RII', pnc: null, section: 'Intake', position: '15', aliases: [], feedbackScore: 0.11 },
  ];
  assert.deepEqual(chooseCandidateLocally('carburador da 143RII', candidates), {
    id: 'right', confidence: 0.9, ambiguous: false,
  });
});

test('traduz vocabulário de balcão e tolera erro de digitação', () => {
  const carburettor = buildSearchGroups('Qual o carburado da Husqvarna 143RII?', ['Husqvarna', '143RII']);
  assert.ok(carburettor.some(group => group.variants.includes('carburettor')));

  const airFilter = buildSearchGroups('filtro de ar da 143RII', ['143RII']);
  assert.ok(airFilter.some(group => group.variants.includes('airfilter')));

  assert.ok(scorePartText('carburador', { name: 'Carburettor', section: 'Intake' }) > scorePartText('carburador', { name: 'Screw', section: 'Carburettor' }));
});

test('entende PT-BR, PT-PT e inglês para embreagem completa', () => {
  const groups = buildSearchGroups('Qual o código da embreagem completa da 143RII?', ['143RII']);
  const clutch = groups.find(group => group.key === 'clutch');

  assert.ok(clutch);
  assert.ok(clutch?.variants.includes('embreagem'));
  assert.ok(clutch?.variants.includes('embraiagem'));
  assert.ok(clutch?.variants.includes('clutch assy'));
  assert.ok(!groups.some(group => group.key === 'literal:completa'));

  const expanded = semanticQueryText('embreagem completa da 143RII', ['143RII']);
  assert.match(expanded, /embraiagem/);
  assert.match(expanded, /clutch assy/);
});

test('seleciona EMBRAIAGEM e elimina parafuso/anilha da mesma vista CLUTCH', () => {
  const candidates = [
    { id: 'assembly', name: 'EMBRAIAGEM', model: '143RII', pnc: '967332904', section: '143RII CLUTCH', position: '14', aliases: [] },
    { id: 'screw', name: 'PARAFUSO', model: '143RII', pnc: '967332904', section: '143RII CLUTCH', position: '8', aliases: [] },
    { id: 'washer', name: 'ANILHA', model: '143RII', pnc: '967332904', section: '143RII CLUTCH', position: '17', aliases: [] },
  ];

  const focused = focusCandidatesByDescription('embreagem completa da 143RII', candidates.map(candidate => ({
    ...candidate,
    alternativeNames: candidate.aliases,
  })));
  assert.deepEqual(focused.map(item => item.id), ['assembly']);
  assert.deepEqual(chooseCandidateLocally('embreagem completa da 143RII', candidates), {
    id: 'assembly', confidence: 0.9, ambiguous: false,
  });
});

test('entende peça composta dividida entre nome e seção do catálogo', () => {
  const groups = buildSearchGroups('tambor da embreagem da 143RII', ['143RII']);
  assert.ok(groups.some(group => group.key === 'drum'));
  assert.ok(groups.some(group => group.key === 'clutch'));

  const relation = inferPartQueryRelation('tambor da embreagem da 143RII');
  assert.equal(relation?.primary.key, 'drum');
  assert.equal(relation?.context.key, 'clutch');

  const drumScore = scorePartText('tambor da embreagem', { name: 'TAMBOR', section: '143RII CLUTCH' });
  const screwScore = scorePartText('tambor da embreagem', { name: 'PARAFUSO', section: '143RII CLUTCH' });
  assert.ok(drumScore > screwScore + 0.3);
});

test('entende peça dentro de conjunto: parafuso da embreagem não vira a embreagem', () => {
  const relation = inferPartQueryRelation('Qual o código do parafuso da embreagem da 143RII?');
  assert.equal(relation?.primary.key, 'screw');
  assert.equal(relation?.context.key, 'clutch');

  const screwInClutch = scorePartText('parafuso da embreagem da 143RII', { name: 'SCREW', section: '143RII CLUTCH' });
  const clutchAssembly = scorePartText('parafuso da embreagem da 143RII', { name: 'EMBRAIAGEM', section: '143RII CLUTCH' });
  const screwInCarb = scorePartText('parafuso da embreagem da 143RII', { name: 'SCREW', section: '143RII CARBURETTOR' });
  assert.ok(screwInClutch > clutchAssembly + 0.35);
  assert.ok(screwInClutch > screwInCarb + 0.25);
});

test('mantém ambiguidade quando existem vários parafusos na vista CLUTCH', () => {
  const candidates = [
    { id: 'screw8', name: 'PARAFUSO', model: '143RII', pnc: '967332904', section: '143RII CLUTCH', position: '8', aliases: [] },
    { id: 'screw13', name: 'PARAFUSO', model: '143RII', pnc: '967332904', section: '143RII CLUTCH', position: '13', aliases: [] },
    { id: 'screw16', name: 'SCREW', model: '143RII', pnc: '967332904', section: '143RII CLUTCH', position: '16', aliases: [] },
    { id: 'assembly', name: 'EMBRAIAGEM', model: '143RII', pnc: '967332904', section: '143RII CLUTCH', position: '14', aliases: [] },
  ];

  const focused = focusCandidatesByDescription('parafuso da embreagem da 143RII', candidates.map(candidate => ({
    ...candidate,
    alternativeNames: candidate.aliases,
  })));
  assert.deepEqual(focused.map(item => item.id), ['screw8', 'screw13', 'screw16']);
  assert.equal(chooseCandidateLocally('parafuso da embreagem da 143RII', candidates).ambiguous, true);
});

test('posição explícita desempata parafusos iguais do mesmo conjunto', () => {
  const candidates = [
    { id: 'screw8', name: 'PARAFUSO', model: '143RII', pnc: '967332904', section: '143RII CLUTCH', position: '8', aliases: [] },
    { id: 'screw13', name: 'PARAFUSO', model: '143RII', pnc: '967332904', section: '143RII CLUTCH', position: '13', aliases: [] },
    { id: 'screw16', name: 'SCREW', model: '143RII', pnc: '967332904', section: '143RII CLUTCH', position: '16', aliases: [] },
  ];

  assert.equal(chooseCandidateLocally('parafuso posição 16 da embreagem da 143RII', candidates).id, 'screw16');
});

test('reconhece termos portugueses de Portugal e nomes usuais de revenda', () => {
  assert.ok(buildSearchGroups('anilha da 143RII', ['143RII']).some(group => group.key === 'washer'));
  assert.ok(buildSearchGroups('cambota da máquina', []).some(group => group.key === 'crankshaft'));
  assert.ok(buildSearchGroups('depósito de combustível', []).some(group => group.key === 'fuel-tank'));
  assert.ok(buildSearchGroups('ponteira da roçadeira', []).some(group => group.key === 'gearbox'));
  assert.ok(buildSearchGroups('caixa de engrenagem', []).some(group => group.key === 'gearbox'));
  assert.ok(buildSearchGroups('carretel de nylon', []).some(group => group.key === 'trimmer-head'));
  assert.ok(buildSearchGroups('campana da embreagem', []).some(group => group.key === 'drum'));
  assert.ok(buildSearchGroups('sabre da motosserra', []).some(group => group.key === 'guide-bar'));
  assert.ok(buildSearchGroups('mufla da motosserra', []).some(group => group.key === 'muffler'));
});

test('prioriza o nome da peça e não oferece componentes vizinhos da mesma vista', () => {
  const candidates = [
    { id: 'assembly', name: 'CARBURADOR', section: '143RII CARBURETTOR', alternativeNames: [] },
    { id: 'washer', name: 'ANILHA', section: '143RII CARBURETTOR', alternativeNames: [] },
    { id: 'valve', name: 'VÁLVULA', section: '143RII CARBURETTOR', alternativeNames: [] },
  ];
  assert.deepEqual(focusCandidatesByDescription('carburador', candidates).map(item => item.id), ['assembly']);
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
