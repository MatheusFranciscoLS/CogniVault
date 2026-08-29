import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseCandidateLocally } from './chat-reliability';

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
