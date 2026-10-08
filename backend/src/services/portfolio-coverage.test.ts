import assert from 'node:assert/strict';
import test from 'node:test';
import { extractCommercialModels, hasStrongCommercialModelShape, isPausedCategory, listPaused, listedPncsForModel, markNotInLine, modelKeyVariants, portalDocumentMatchesModel, stripPortalTitleNoise, portalResultMatchesModel, rankPortfolioCoverageGaps, summarizePortfolioCoverage, type PortfolioCoverageItem } from './portfolio-coverage';

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

test('match do Portal exige modelo completo e rejeita família, sufixo ou prefixo de outro modelo', () => {
  assert.equal(portalResultMatchesModel('HUSQVARNA 445', '445E'), false);
  assert.equal(portalResultMatchesModel('HUSQVARNA 445 e-series TrioBrake', '445E'), true);
  assert.equal(portalResultMatchesModel('HUSQVARNA 236', '236R'), false);
  assert.equal(portalResultMatchesModel('HUSQVARNA Roçadeira Husqvarna 236 RS', '236R'), false);
  assert.equal(portalResultMatchesModel('HUSQVARNA Roçadeira Husqvarna 236R', '236R'), true);
  assert.equal(portalResultMatchesModel('HUSQVARNA Roçadeira Husqvarna 143 RST', '143R'), false);
  assert.equal(portalResultMatchesModel('HUSQVARNA Roçadeira Husqvarna 143R II', '143R'), false);
  assert.equal(portalResultMatchesModel('HUSQVARNA Roçadeira Husqvarna 143RS', '143R'), false);
  assert.equal(portalResultMatchesModel('Husqvarna 143R', '143R'), true);
  assert.equal(portalResultMatchesModel('HUSQVARNA Roçadeira Husqvarna 143R II', '143RII'), true);
  assert.equal(portalResultMatchesModel('HUSQVARNA 343FR', '343R'), false);
  assert.equal(portalResultMatchesModel('HUSQVARNA PW 235R', '235R'), false);
  assert.equal(portalResultMatchesModel('PW 235R', '235R'), false);
  assert.equal(portalResultMatchesModel('HUSQVARNA K 770', 'K770'), true);
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

test('prioriza lacunas e preserva evidência e diagnóstico da homologação', () => {
  const gaps = rankPortfolioCoverageGaps([
    { model: '143RII', normalizedModel: '143RII', status: 'LOCAL_IPL', source: '143RII.pdf', pnc: null, commercialSignals: 20, commercialEvidence: ['ROC.143RII'] },
    {
      model: 'Z248F', normalizedModel: 'Z248F', status: 'UNVERIFIED', source: null, pnc: null,
      commercialSignals: 8, commercialEvidence: ['TRATOR Z 248F'], commercialCategory: 'TRATOR', portalVerification: 'INCONCLUSIVE',
      portalVerificationNote: 'Portal indisponível durante a consulta.',
    },
    {
      model: 'LC353AWD', normalizedModel: 'LC353AWD', status: 'UNVERIFIED', source: null, pnc: null,
      commercialSignals: 12, commercialEvidence: ['LC353AWD/LC353V'], portalVerification: 'NO_EXACT_MATCH',
      portalVerificationNote: 'Nenhum produto exato retornado.',
    },
    { model: '125B', normalizedModel: '125B', status: 'PORTAL_IPL', source: 'Portal', pnc: '952711902', commercialSignals: 30, commercialEvidence: ['125B'] },
  ], 2);

  assert.deepEqual(gaps, [
    {
      model: 'LC353AWD', normalizedModel: 'LC353AWD', status: 'UNVERIFIED', commercialSignals: 12,
      commercialEvidence: ['LC353AWD/LC353V'], commercialCategory: null, portalVerification: 'NO_EXACT_MATCH',
      portalVerificationNote: 'Nenhum produto exato retornado.',
    },
    {
      model: 'Z248F', normalizedModel: 'Z248F', status: 'UNVERIFIED', commercialSignals: 8,
      commercialEvidence: ['TRATOR Z 248F'], commercialCategory: 'TRATOR', portalVerification: 'INCONCLUSIVE',
      portalVerificationNote: 'Portal indisponível durante a consulta.',
    },
  ]);
});

test('documento de IPL do Portal só vale quando cita o modelo inteiro', () => {
  assert.equal(portalDocumentMatchesModel('IPL, Husqvarna, 120i, 2017-01', '120I'), true);
  assert.equal(portalDocumentMatchesModel('IPL, 123 HD65x, 2007-02', '123HD65X'), true);
  assert.equal(portalDocumentMatchesModel('IPL, 325 HDA55 X-series, 323 HE3, 325 HE3 X-series, HA110, 2005-10', '325HE3X'), true);
  assert.equal(portalDocumentMatchesModel('IPL update, 440e II, 2019-03, Starter', '440E'), true);
});

test('documento de IPL não aceita número colado, código de outro modelo na frente nem documento que não é IPL', () => {
  assert.equal(portalDocumentMatchesModel('IPL, Husqvarna, 1120i, 2017-01', '120I'), false);
  assert.equal(portalDocumentMatchesModel('IPL, Husqvarna, 120iX, 2017-01', '120I'), false);
  assert.equal(portalDocumentMatchesModel('IPL, PW 235R, 2006-01', '235R'), false);
  assert.equal(portalDocumentMatchesModel('Manual do operador, Husqvarna, 120i, 2017-01', '120I'), false);
  assert.equal(portalDocumentMatchesModel('IPL, Husqvarna, 120i', 'AB'), false);
});

test('o que acompanha o produto no título do Portal não reprova o modelo, mas outro modelo continua reprovado', () => {
  assert.equal(portalResultMatchesModel('HUSQVARNA Cortador de Grama Husqvarna a bateria LC137i (sem bateria e carregador)', 'LC137I'), true);
  assert.equal(portalResultMatchesModel('HUSQVARNA Motosserra Husqvarna a bateria 240i (sem bateria e carregador)', '240I'), true);
  assert.equal(portalResultMatchesModel('HUSQVARNA Roçadeira a bateria Husqvarna 325iR​ (sem carregador e bateria)', '325IR'), true);
  assert.equal(portalResultMatchesModel('HUSQVARNA Pulverizador manual Husqvarna 301SM 1.5L', '301SM'), true);
  assert.equal(portalResultMatchesModel('HUSQVARNA Pulverizador costal manual Husqvarna 320SM 20L', '320SM'), true);
  assert.equal(portalResultMatchesModel('HUSQVARNA Motosserra Husqvarna a bateria 540i XP® (sem bateria e carregador)', '540I'), false);
  // Outro modelo da mesma família não vale como prova.
  assert.equal(portalResultMatchesModel('HUSQVARNA 240 e-series', '240I'), false);
  assert.equal(portalResultMatchesModel('Husqvarna K 540i', '540I'), false);
  assert.equal(portalResultMatchesModel('HUSQVARNA 543RS', '543R'), false);
  assert.equal(stripPortalTitleNoise('X 8L'), 'X');
});

test('número + uma letra aceita a ordem do Portal (750K = K750), e só isso', () => {
  assert.deepEqual(modelKeyVariants('750K'), ['750K', 'K750']);
  assert.deepEqual(modelKeyVariants('543R'), ['543R', 'R543']);
  assert.deepEqual(modelKeyVariants('LC137I'), ['LC137I']);
  assert.deepEqual(modelKeyVariants('325HE3X'), ['325HE3X']);
  assert.equal(portalDocumentMatchesModel('IPL, K750, K 750, 2010-02', '750K'), true);
  assert.equal(portalResultMatchesModel('Husqvarna K 750', '750K'), true);
  assert.equal(portalResultMatchesModel('PW K 750', '750K'), false); // código curto de outro modelo na frente continua barrado
});

test('modelo sem lista no Portal e fora da lista vigente deixa de ser lacuna; o que está em linha continua', () => {
  const base = { source: null, pnc: null, commercialSignals: 1, commercialEvidence: [] as string[] };
  const items = [
    { ...base, model: 'AM315', normalizedModel: 'AM315', status: 'UNVERIFIED' as const, portalVerification: 'NO_EXACT_MATCH' as const },
    { ...base, model: 'MAC407B', normalizedModel: 'MAC407B', status: 'UNVERIFIED' as const, portalVerification: 'NO_EXACT_MATCH' as const },
    { ...base, model: 'BLI300', normalizedModel: 'BLI300', status: 'UNVERIFIED' as const, portalVerification: 'NO_IPL' as const },
    { ...base, model: 'NOVO1', normalizedModel: 'NOVO1', status: 'UNVERIFIED' as const, portalVerification: 'NOT_CHECKED' as const },
    { ...base, model: 'Z460', normalizedModel: 'Z460', status: 'PORTAL_IPL' as const, portalVerification: 'VERIFIED' as const },
  ];

  const marcados = markNotInLine(items, ['AM315 Mark II', '143R II']);
  assert.deepEqual(marcados.map(item => item.status), ['UNVERIFIED', 'NOT_APPLICABLE', 'NOT_APPLICABLE', 'UNVERIFIED', 'PORTAL_IPL']);

  // sem lista de máquinas importada, nada se conclui
  assert.deepEqual(markNotInLine(items, []).map(item => item.status), items.map(item => item.status));

  // a cobertura não conta o que não tem vista a esperar
  const resumo = summarizePortfolioCoverage(marcados);
  assert.equal(resumo.notApplicable, 2);
  assert.equal(resumo.unverified, 2);
  assert.equal(resumo.coverageRate, 1 / 3);
});

test('o modelo vale como palavra inteira em qualquer ponto do título do Portal (os links que o dono achou)', () => {
  assert.equal(portalResultMatchesModel('HUSQVARNA HH 212 - 599348659', 'HH212'), true);
  assert.equal(portalResultMatchesModel('HUSQVARNA HH 196/MP/OB', 'HH196'), true);
  assert.equal(portalResultMatchesModel('HUSQVARNA Motobomba Husqvarna a gasolina W25P 2T Autoescorvante', 'W25P'), true);
  assert.equal(portalResultMatchesModel('HUSQVARNA Motocultivador Husqvarna TF 545DE', 'TF545DE'), true);
  assert.equal(portalResultMatchesModel('HUSQVARNA Trator Cortador de Grama Husqvarna TS 219TFm', 'TS219TFM'), true);
  // as guardas continuam: número ou letra colado, família parecida e código curto de outro modelo na frente
  assert.equal(portalResultMatchesModel('HUSQVARNA 543RS', '543R'), false);
  assert.equal(portalResultMatchesModel('HUSQVARNA HH 2120', 'HH212'), false);
  assert.equal(portalResultMatchesModel('HUSQVARNA PW 235R kit', '235R'), false);
});

test('máquina da lista vigente é consultada pelo PNC: pega o artigo de 9 dígitos, sem o BR, de todas as versões do modelo', () => {
  const listada = [
    { model: 'W25P', pnc: '970619901' },
    { model: '143RST', pnc: '970743401BR' },
    { model: '143RST', pnc: '970743402BR' },
    { model: 'AM315 Mark II', pnc: '970000111' },
    { model: '120iB', pnc: '967976101CJ' },
  ];
  assert.deepEqual(listedPncsForModel(listada, 'W25P'), ['970619901']);
  assert.deepEqual(listedPncsForModel(listada, '143RST'), ['970743401', '970743402']);
  assert.deepEqual(listedPncsForModel(listada, 'AM315'), ['970000111']);
  assert.deepEqual(listedPncsForModel(listada, '120iB'), []); // conjunto (CJ) é outro item
  assert.deepEqual(listedPncsForModel(listada, 'ZZZ1'), []);
});

test('categoria desligada (Automower) sai da conta, não vira lacuna e continua listada', () => {
  const item = (model: string, status: PortfolioCoverageItem['status'], category: string | null): PortfolioCoverageItem => ({
    model, normalizedModel: model.toUpperCase(), status, commercialSignals: 1, commercialEvidence: [], commercialCategory: category, portalVerification: 'NOT_CHECKED', portalVerificationNote: null, source: null, pnc: null,
  } as PortfolioCoverageItem);
  const items = [
    item('AM315', 'UNVERIFIED', 'AUTOMOWER'),
    item('AM435XAWD', 'UNVERIFIED', 'Automower'),
    item('226KS12', 'UNVERIFIED', 'DERRIÇADEIRA'),
    item('143R', 'PORTAL_IPL', 'ROÇADEIRA'),
    item('AM-COM-VISTA', 'PORTAL_IPL', 'AUTOMOWER'),
  ];
  const resumo = summarizePortfolioCoverage(items);
  assert.equal(resumo.paused, 2, 'só o Automower SEM fonte entra em pausa');
  assert.equal(resumo.unverified, 1, 'o 226KS12 continua sendo lacuna');
  assert.equal(resumo.covered, 2, 'o Automower que já tem vista continua contando');
  assert.equal(resumo.coverageRate, 2 / 3, 'a taxa não conta os em pausa no total');
  assert.deepEqual(listPaused(resumo.items).map(entry => entry.model), ['AM315', 'AM435XAWD']);
  assert.equal(isPausedCategory('AUTOMOWER LINHA EPOS'), true);
  assert.equal(isPausedCategory('ROÇADEIRA'), false);
});
