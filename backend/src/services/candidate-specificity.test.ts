import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseCandidateLocally } from './chat-reliability';
import { extractTechnicalQualifiers, technicalConstraintBonus } from './candidate-specificity';

test('parafuso da embreagem prioriza o item tecnicamente nomeado como Screw Clutch shoe', () => {
  const candidates = [
    { id: 'pos6', name: 'SCREW', model: '143RII', pnc: null, section: 'CLUTCH', position: '6', aliases: [] },
    { id: 'pos7', name: 'SCREW', model: '143RII', pnc: null, section: 'CLUTCH', position: '7', aliases: [] },
    { id: 'pos8', name: 'SCREW', model: '143RII', pnc: null, section: 'CLUTCH', position: '8', aliases: [] },
    { id: 'pos13', name: 'SCREW', model: '143RII', pnc: null, section: 'CLUTCH', position: '13', aliases: [] },
    { id: 'pos16', name: 'Screw Clutch shoe', model: '143RII', pnc: null, section: 'CLUTCH', position: '16', aliases: [] },
  ];

  assert.deepEqual(chooseCandidateLocally('qual o código do parafuso da embreagem da 143RII?', candidates), {
    id: 'pos16',
    confidence: 0.9,
    ambiguous: false,
  });
});

test('continua ambíguo quando todos os parafusos têm apenas contexto genérico de seção', () => {
  const candidates = [
    { id: 'pos6', name: 'SCREW', model: 'X', pnc: null, section: 'CLUTCH', position: '6', aliases: [] },
    { id: 'pos8', name: 'SCREW', model: 'X', pnc: null, section: 'CLUTCH', position: '8', aliases: [] },
  ];

  assert.equal(chooseCandidateLocally('parafuso da embreagem', candidates).ambiguous, true);
});

test('a mesma regra funciona para outra família de máquina', () => {
  const candidates = [
    { id: 'generic', name: 'SPRING', model: 'TS114', pnc: null, section: 'SIDE DISCHARGE DEFLECTOR', position: '3', aliases: [] },
    { id: 'specific', name: 'Deflector spring', model: 'TS114', pnc: null, section: 'SIDE DISCHARGE DEFLECTOR', position: '4', aliases: [] },
  ];

  assert.equal(chooseCandidateLocally('mola do defletor lateral do TS114', candidates).id, 'specific');
});

test('transmissão esquerda do Z460 ganha evidência e RH é penalizada', () => {
  const query = 'qual a transmissão esquerda do giro zero Z460?';
  const left = technicalConstraintBonus(query, { name: 'TRANSMISSÃO HTE 10CC PUMP 230CC MOTOR LH' });
  const right = technicalConstraintBonus(query, { name: 'TRANSMISSÃO HTE 10CC PUMP 230CC MOTOR RH' });
  assert.ok(left > 0);
  assert.ok(right < 0);
  assert.ok(left - right > 0.5);
});

test('LC353AWD diferencia transmissão dianteira e traseira', () => {
  const query = 'qual a transmissão dianteira da LC353AWD?';
  const front = technicalConstraintBonus(query, { name: 'TRANSMISSÃO AWD Front 21 EFF' });
  const rear = technicalConstraintBonus(query, { name: 'TRANSMISSÃO REAR, AWD 21IN' });
  assert.ok(front > rear + 0.5);
});

test('Rim/Spur, passo e dentes são restrições independentes', () => {
  const query = 'pinhão Rim 3/8 7 dentes da 365 Special';
  const exact = technicalConstraintBonus(query, { name: 'CONJ DE EMBRAIAGEM Rim 3/8 7T' });
  const wrongTeeth = technicalConstraintBonus(query, { name: 'CONJ DE EMBRAIAGEM Rim 3/8 8T' });
  const spur = technicalConstraintBonus(query, { name: 'CONJ DE EMBRAIAGEM Spur 3/8 7T' });
  assert.ok(exact > wrongTeeth);
  assert.ok(exact > spur);
});

test('dimensão métrica contraditória reduz score do parafuso', () => {
  const query = 'parafuso M5x20 da embreagem';
  const exact = technicalConstraintBonus(query, { name: 'SCREW Internal Torx Socket Head Cap M 5 X 20' });
  const other = technicalConstraintBonus(query, { name: 'SCREW Internal Torx Socket Head Cap M 5 X 16' });
  assert.ok(exact > 0);
  assert.ok(other < 0);
});

test('medida em milímetros distingue variantes físicas', () => {
  const query = 'adaptador da lâmina 22 mm';
  const exact = technicalConstraintBonus(query, { name: 'BLADE ADAPTER Ø22 mm' });
  const other = technicalConstraintBonus(query, { name: 'BLADE ADAPTER Ø25 mm' });
  assert.ok(exact > 0);
  assert.ok(other < 0);
});

test('comprimento em milímetros pode desempatar eixo motriz', () => {
  const query = 'eixo motriz 1114mm do 525P5S';
  const exact = technicalConstraintBonus(query, { name: 'EIXO MOTRIZ ClickOn 1114mm' });
  const other = technicalConstraintBonus(query, { name: 'EIXO MOTRIZ ClickOn 967mm' });
  assert.ok(exact > other);
});

test('tensão elétrica explícita diferencia componentes', () => {
  const query = 'motor de partida 12V';
  const exact = technicalConstraintBonus(query, { name: 'STARTER MOTOR 12 V' });
  const other = technicalConstraintBonus(query, { name: 'STARTER MOTOR 24 V' });
  assert.ok(exact > 0);
  assert.ok(other < 0);
});

test('medida em polegadas não confunde 12 polegadas com o 3/8 do passo', () => {
  const qualifiers = extractTechnicalQualifiers('lâmina 12" 3/8 mini');
  assert.equal(qualifiers.inchSize, 12);
  assert.equal(qualifiers.chainPitch, '3/8');
});
