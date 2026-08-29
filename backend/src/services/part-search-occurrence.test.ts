import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseCandidateLocally } from './chat-reliability';
import { deduplicatePartCandidates, type PartCandidate } from './part-search.service';

function candidate(overrides: Partial<PartCandidate> & Pick<PartCandidate, 'id' | 'name' | 'partNumber' | 'normalizedPartNumber' | 'section' | 'position'>): PartCandidate {
  return {
    id: overrides.id,
    documentId: overrides.documentId || `doc-${overrides.id}`,
    filename: overrides.filename || `${overrides.id}.pdf`,
    manufacturer: 'Husqvarna',
    model: overrides.model || '143RII',
    normalizedModel: overrides.normalizedModel || '143RII',
    pnc: overrides.pnc ?? null,
    normalizedPnc: overrides.normalizedPnc ?? null,
    universalAcrossPnc: overrides.universalAcrossPnc ?? true,
    section: overrides.section,
    position: overrides.position,
    name: overrides.name,
    alternativeNames: overrides.alternativeNames || [],
    partNumber: overrides.partNumber,
    normalizedPartNumber: overrides.normalizedPartNumber,
    page: overrides.page ?? 14,
    notes: overrides.notes ?? null,
    distance: overrides.distance ?? 0.2,
    feedbackScore: overrides.feedbackScore ?? 0,
    searchMethod: overrides.searchMethod || 'LEXICAL',
  };
}

test('preserva o mesmo código quando ele aparece em conjuntos ou posições diferentes', () => {
  const rows = [
    candidate({ id: 'clutch', name: 'PARAFUSO', partNumber: '506609401', normalizedPartNumber: '506609401', section: '143RII CLUTCH', position: '6' }),
    candidate({ id: 'crankcase', name: 'PARAFUSO', partNumber: '506609401', normalizedPartNumber: '506609401', section: '143RII CRANKCASE', position: '13' }),
  ];

  const result = deduplicatePartCandidates(rows);
  assert.equal(result.length, 2);
  assert.deepEqual(new Set(result.map(item => `${item.section}|${item.position}`)), new Set(['143RII CLUTCH|6', '143RII CRANKCASE|13']));
});

test('une descrições complementares de catálogos equivalentes da mesma ocorrência', () => {
  const rows = [
    candidate({ id: 'portal-br', name: 'SCREW', partNumber: '505297801', normalizedPartNumber: '505297801', section: '143RII CLUTCH', position: '16', distance: 0.2 }),
    candidate({ id: 'ipl-en', name: 'Screw Clutch shoe', partNumber: '505 29 78-01', normalizedPartNumber: '505297801', section: 'Clutch', position: '16', page: 11, distance: 0.24 }),
  ];

  const result = deduplicatePartCandidates(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'SCREW');
  assert.ok(result[0].alternativeNames.some(alias => alias === 'Screw Clutch shoe'));
});

test('descrição complementar faz o parafuso específico da embreagem vencer sem hardcode de modelo ou código', () => {
  const specific = deduplicatePartCandidates([
    candidate({ id: 'pos16', name: 'SCREW', partNumber: '505297801', normalizedPartNumber: '505297801', section: '143RII CLUTCH', position: '16' }),
    candidate({ id: 'pos16-en', name: 'Screw Clutch shoe', partNumber: '505 29 78-01', normalizedPartNumber: '505297801', section: 'Clutch', position: '16', distance: 0.24 }),
  ])[0];

  const generic = ['6', '7', '8', '13'].map(position => candidate({
    id: `pos${position}`,
    name: 'SCREW',
    partNumber: `GENERIC${position}`,
    normalizedPartNumber: `GENERIC${position}`,
    section: '143RII CLUTCH',
    position,
  }));

  const selection = chooseCandidateLocally('qual o código do parafuso da embreagem da 143RII?', [
    ...generic.map(item => ({
      id: item.id,
      name: item.name,
      model: item.model,
      pnc: item.pnc,
      section: item.section,
      position: item.position,
      aliases: item.alternativeNames,
    })),
    {
      id: specific.id,
      name: specific.name,
      model: specific.model,
      pnc: specific.pnc,
      section: specific.section,
      position: specific.position,
      aliases: specific.alternativeNames,
    },
  ]);

  assert.equal(selection.id, 'pos16');
  assert.equal(selection.ambiguous, false);
});
