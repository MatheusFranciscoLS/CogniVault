import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessCatalogHealth,
  diagnoseCatalogStructure,
  type CatalogHealthPart,
} from './catalog-health';

function part(page: number, section: string, position: number): CatalogHealthPart {
  return {
    model: '321R',
    normalizedModel: '321R',
    pnc: null,
    normalizedPnc: null,
    universalAcrossPnc: true,
    page,
    section,
    position: String(position),
    name: `PEÇA ${position}`,
    notes: null,
    normalizedPartNumber: `500${String(page).padStart(2, '0')}${String(position).padStart(4, '0')}`,
  };
}

test('saltos legítimos de posição do 321R são aviso e não peças faltantes confirmadas', () => {
  const parts = [
    ...[1,2,3,4,5,6,7,9,10,11,12,13].map(position => part(17, 'CRANKCASE & CLUTCHDRUM', position)),
    ...[1,2,4,5,7,8,9,10].map(position => part(19, 'STARTER', position)),
  ];
  const diagnostics = diagnoseCatalogStructure(parts, '321R', null);
  assert.equal(diagnostics.missingPositionCount, 3);

  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: '321R',
    extractedModels: ['321R'],
    snapshotPartCount: parts.length,
    partCount: parts.length,
    partsWithPage: parts.length,
    partsWithSection: parts.length,
    partsWithInformativeSection: parts.length,
    partsWithPosition: parts.length,
    chunkCount: 2,
    embeddedPartCount: 0,
    missingPositionCount: diagnostics.missingPositionCount,
    extractionMethod: 'HUSQVARNA_IPL_TEXT',
    processingStage: 'READY',
    category: 'Roçadeiras',
  });

  assert.equal(result.reviewStatus, 'READY');
  assert.equal(result.score, 100);
  assert.equal(result.reasons.length, 0);
  assert.ok(result.warnings.some(warning => warning.includes('salto')));
  assert.ok(result.warnings.some(warning => warning.includes('não é tratado como peça faltando')));
});

test('descrição de conjunto não pode receber saúde 100 como modelo de equipamento', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: 'assy 321S',
    extractedModels: ['assy 321S'],
    snapshotPartCount: 81,
    partCount: 81,
    partsWithPage: 81,
    partsWithSection: 81,
    partsWithInformativeSection: 81,
    partsWithPosition: 81,
    chunkCount: 10,
    embeddedPartCount: 0,
    extractionMethod: 'HUSQVARNA_IPL_TEXT',
    processingStage: 'READY',
    category: 'Roçadeiras',
  });

  assert.equal(result.reviewStatus, 'NEEDS_REVIEW');
  assert.ok(result.score < 100);
  assert.ok(result.reasons.some(reason => reason.includes('descrição de peça/conjunto')));
});
