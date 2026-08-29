import test from 'node:test';
import assert from 'node:assert/strict';
import {
  domainIndexAliases,
  extractKnownHusqvarnaModel,
  inferEquipmentFamily,
  resolveEngineCatalogRoute,
} from './husqvarna-domain-knowledge';
import { buildSearchGroups, inferredSearchAliases, scorePartText } from './part-vocabulary';
import { extractLikelyModel } from './chat-reliability';

test('reconhece as famílias estudadas sem confundir Rider, motor e pulverizador', () => {
  assert.equal(inferEquipmentFamily('motosserra 353'), 'CHAINSAW');
  assert.equal(inferEquipmentFamily('peça do R316TX'), 'RIDER');
  assert.equal(inferEquipmentFamily('peça do HS608'), 'ENGINE');
  assert.equal(inferEquipmentFamily('peça do 525P5S'), 'POLE_PRUNER');
  assert.equal(inferEquipmentFamily('peça do 321S25'), 'POWER_SPRAYER');
  assert.equal(extractKnownHusqvarnaModel('motosserra 135 Mark II'), '135MARKII');
  assert.equal(extractLikelyModel('qual o carburador da motosserra 353?'), '353');
});

test('caracol de soprador significa voluta/scroll e não o impulsor', () => {
  const query = 'qual o código do caracol do soprador 125B?';
  const groups = buildSearchGroups(query, ['', '125B']);
  assert.ok(groups.some(group => group.key === 'domain:blower-volute'));

  const scrollScore = scorePartText(query, { name: 'ASSEMBLY OUTER SCROLL', section: '125B FAN HOUSING' });
  const impellerScore = scorePartText(query, { name: 'IMPULSOR IMPELLER', section: '125B FAN' });
  assert.ok(scrollScore > impellerScore + 0.25, `${scrollScore} deveria superar ${impellerScore}`);
});

test('lâmina em podador 525P5S é tratada como sabre/barra sem alterar lâmina globalmente', () => {
  const poleQuery = 'qual a lâmina de 12 do podador 525P5S?';
  const poleGroups = buildSearchGroups(poleQuery, ['', '525P5S']);
  assert.ok(poleGroups.some(group => group.key === 'domain:guide-bar-shop'));
  assert.ok(!poleGroups.some(group => group.key === 'blade'));

  const poleBar = scorePartText(poleQuery, { name: 'LÂMINA LAM 12 3/8 mini 1.3 SM 7T', section: 'ACCESSORIES' });
  const unrelatedBlade = scorePartText(poleQuery, { name: 'BLADE 12', section: 'CUTTING BLADE' });
  assert.ok(poleBar > unrelatedBlade);

  const mowerGroups = buildSearchGroups('qual a lâmina da LC151S?', ['', 'LC151S']);
  assert.ok(mowerGroups.some(group => group.key === 'blade'));
  assert.ok(!mowerGroups.some(group => group.key === 'domain:guide-bar-shop'));
});

test('pistão da bomba do 321S25 vence o pistão do motor', () => {
  const query = 'qual o código do pistão da bomba do pulverizador 321S25?';
  const pump = scorePartText(query, { name: 'PISTÃO DA BOMBA Pump piston', section: 'PUMP / GEARBOX' });
  const engine = scorePartText(query, { name: 'CONJ. DO PISTÃO kit 321S sprayer', section: 'CYLINDER' });
  assert.ok(pump > engine + 0.3, `${pump} deveria superar ${engine}`);
});

test('pistão do motor do 321S25 não é confundido com pistão da bomba', () => {
  const query = 'qual o pistão do motor do 321S25?';
  const pump = scorePartText(query, { name: 'PISTÃO DA BOMBA Pump piston', section: 'PUMP / GEARBOX' });
  const engine = scorePartText(query, { name: 'CONJ. DO PISTÃO kit 321S sprayer', section: 'CYLINDER' });
  assert.ok(engine > pump + 0.2, `${engine} deveria superar ${pump}`);
});

test('giro zero usa lado esquerdo/direito como evidência técnica forte', () => {
  const query = 'qual a transmissão esquerda do Z460?';
  const left = scorePartText(query, { name: 'TRANSMISSÃO HTE 10CC PUMP 230CC MOTOR LH', section: 'TRANSMISSION' });
  const right = scorePartText(query, { name: 'TRANSMISSÃO HTE 10CC PUMP 230CC MOTOR RH', section: 'TRANSMISSION' });
  assert.ok(left > right + 0.35, `${left} deveria superar ${right}`);
});

test('cortador AWD diferencia transmissão dianteira e traseira', () => {
  const query = 'qual a transmissão dianteira da LC353AWD?';
  const front = scorePartText(query, { name: 'TRANSMISSÃO AWD Front', section: 'DRIVE' });
  const rear = scorePartText(query, { name: 'TRANSMISSÃO Rear AWD', section: 'DRIVE' });
  assert.ok(front > rear + 0.3, `${front} deveria superar ${rear}`);
});

test('motosserra mantém Rim e Spur como variantes construtivas distintas', () => {
  const query = 'qual o pinhão Rim 3/8 7 dentes da 365 Special?';
  const rim = scorePartText(query, { name: 'Rim 3/8 7T', section: 'CLUTCH DRUM' });
  const spur = scorePartText(query, { name: 'Spur 3/8 7T', section: 'CLUTCH DRUM' });
  assert.ok(rim > spur + 0.3, `${rim} deveria superar ${spur}`);
});

test('termos de mecânico de motores convergem para a nomenclatura dos IPLs', () => {
  assert.ok(buildSearchGroups('balancim do motor HS452AE').some(group => group.key === 'domain:rocker-arm'));
  assert.ok(buildSearchGroups('árvore de cames do HV586AE').some(group => group.key === 'domain:camshaft'));
  assert.ok(buildSearchGroups('peneira de óleo do HS608').some(group => group.key === 'domain:oil-strainer'));
  assert.ok(buildSearchGroups('regulador de voltagem do HS452AE').some(group => group.key === 'domain:voltage-rectifier'));
});

test('relações máquina → motor só são ativadas quando comprovadas e respeitam PNC', () => {
  assert.deepEqual(resolveEngineCatalogRoute('TS148', '', 'qual o virabrequim do TS148?'), {
    status: 'ROUTE', machineModel: 'TS148', engineModel: 'HV764', engineArticle: '598632101',
  });
  assert.deepEqual(resolveEngineCatalogRoute('TS254G', '', 'qual o virabrequim do TS254G?'), {
    status: 'ROUTE', machineModel: 'TS254G', engineModel: 'HV764', engineArticle: '598632103',
  });

  const ts142WithoutPnc = resolveEngineCatalogRoute('TS142', '', 'qual o virabrequim do TS142?');
  assert.equal(ts142WithoutPnc?.status, 'PNC_REQUIRED');
  assert.deepEqual(resolveEngineCatalogRoute('TS142', '96041043000', 'qual o virabrequim do TS142?'), {
    status: 'ROUTE', machineModel: 'TS142', engineModel: 'HS608', engineArticle: '593230101',
  });
  assert.deepEqual(resolveEngineCatalogRoute('TS138', '96041042900', 'qual o motor de partida do TS138?'), {
    status: 'ROUTE', machineModel: 'TS138', engineModel: 'HS452AE', engineArticle: null,
  });

  assert.equal(resolveEngineCatalogRoute('TS148', '', 'qual o defletor lateral do TS148?'), null);
});

test('aliases de indexação preservam nome oficial e acrescentam linguagem de balcão por família', () => {
  const blowerAliases = domainIndexAliases('ASSEMBLY OUTER SCROLL', 'FAN HOUSING', '125B');
  assert.ok(blowerAliases.includes('caracol'));

  const inferred = inferredSearchAliases('ASSEMBLY OUTER SCROLL', 'FAN HOUSING', [], '125B');
  assert.ok(inferred.includes('caracol'));

  const engineAliases = domainIndexAliases('ROCKER ARM KIT', 'CYLINDER HEAD ASSY', 'HS452AE');
  assert.ok(engineAliases.includes('balancim'));
});

test('pulverizador manual aprende bomba, lança e bico sem herdar motor 2T', () => {
  const pump = buildSearchGroups('bomba do pulverizador 320SM 20L');
  const lance = buildSearchGroups('lança do 320SM 20L');
  assert.ok(pump.some(group => group.key === 'domain:manual-sprayer-pump'));
  assert.ok(lance.some(group => group.key === 'domain:spray-lance'));
});
