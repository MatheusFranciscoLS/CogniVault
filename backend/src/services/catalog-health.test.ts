import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessCatalogHealth,
  diagnoseCatalogStructure,
  isInformativeCatalogSection,
  type CatalogHealthPart,
} from './catalog-health';

function healthPart(overrides: Partial<CatalogHealthPart> = {}): CatalogHealthPart {
  return {
    model: '143RII',
    normalizedModel: '143RII',
    pnc: null,
    normalizedPnc: null,
    universalAcrossPnc: true,
    page: 1,
    section: 'CLUTCH',
    position: '1',
    name: 'PEÇA',
    notes: null,
    normalizedPartNumber: '500000001',
    ...overrides,
  };
}

test('keeps a well structured catalog at 100 structural health', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: '372 XP',
    pnc: '965702302',
    extractedModels: ['372 XP'],
    extractedPncs: ['965702302'],
    snapshotPartCount: 320,
    partCount: 320,
    partsWithPage: 320,
    partsWithSection: 318,
    partsWithPosition: 320,
    chunkCount: 28,
    embeddedPartCount: 320,
    extractionMethod: 'HUSQVARNA_IPL_TEXT',
    processingStage: 'READY',
    category: 'Motosserras',
  });
  assert.equal(result.reviewStatus, 'READY');
  assert.equal(result.score, 100);
  assert.equal(result.reasons.length, 0);
});

test('multiple PNCs are valid catalog coverage and do not reduce health', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: 'TS114',
    pnc: null,
    extractedModels: ['TS114'],
    extractedPncs: ['970622401', '970622402', '970622403'],
    snapshotPartCount: 250,
    partCount: 250,
    partsWithPage: 250,
    partsWithSection: 250,
    partsWithInformativeSection: 250,
    partsWithPosition: 250,
    chunkCount: 20,
    embeddedPartCount: 250,
  });
  assert.equal(result.reviewStatus, 'READY');
  assert.equal(result.score, 100);
  assert.ok(!result.reasons.some(reason => reason.includes('mais de um PNC')));
});

test('a part title persisted as model is detected even when the catalog has many parts', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: 'FIOS',
    extractedModels: ['FIOS'],
    partCount: 326,
    partsWithPage: 326,
    partsWithSection: 326,
    partsWithPosition: 326,
    chunkCount: 20,
    embeddedPartCount: 0,
  });

  assert.equal(result.reviewStatus, 'NEEDS_REVIEW');
  assert.ok(result.score < 100);
  assert.ok(result.reasons.some(reason => reason.includes('título de peça')));
});

test('an old IPL without a confirmed PNC remains usable and explains the limitation', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: '226R',
    extractedPncs: ['20100400017'],
    partCount: 197,
    partsWithPage: 197,
    partsWithSection: 197,
    partsWithPosition: 197,
    chunkCount: 12,
    embeddedPartCount: 0,
  });

  assert.equal(result.reviewStatus, 'READY');
  assert.equal(result.score, 100);
  assert.ok(result.warnings.some(warning => warning.includes('IPLs antigos')));
});

test('operational warnings do not reduce structural health', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: '143RII',
    pnc: '967332904',
    extractedModels: ['143RII'],
    extractedPncs: ['967332904'],
    partCount: 258,
    partsWithPage: 258,
    partsWithSection: 258,
    partsWithInformativeSection: 258,
    partsWithPosition: 258,
    chunkCount: 18,
    embeddedPartCount: 0,
    extractionMethod: 'GEMINI:gemini-3.7-flash',
    processingStage: 'READY_WITHOUT_EMBEDDINGS',
    category: 'Roçadeiras',
  });
  assert.equal(result.reviewStatus, 'READY');
  assert.equal(result.score, 100);
  assert.ok(result.warnings.some(warning => warning.includes('vetorial')));
  assert.ok(result.warnings.some(warning => warning.includes('IA')));
});

test('very incomplete extraction is stopped for human review', () => {
  const result = assessCatalogHealth({
    manufacturer: null,
    model: null,
    partCount: 4,
    partsWithPage: 0,
    partsWithSection: 1,
    partsWithPosition: 1,
    chunkCount: 0,
    embeddedPartCount: 0,
  });
  assert.equal(result.reviewStatus, 'NEEDS_REVIEW');
  assert.ok(result.score < 40);
});

test('unresolved different codes in a proven exploded-view occurrence require review', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: 'LC 151S',
    partCount: 90,
    partsWithPage: 90,
    partsWithSection: 90,
    partsWithPosition: 90,
    chunkCount: 8,
    embeddedPartCount: 90,
    conflictingOccurrenceCount: 2,
  });
  assert.equal(result.reviewStatus, 'NEEDS_REVIEW');
  assert.ok(result.score < 100);
  assert.ok(result.reasons.some(reason => reason.includes('sem regra de PNC, série ou mercado')));
});

test('serial-range variants in the same position are coverage, not a structural conflict', () => {
  const diagnostics = diagnoseCatalogStructure([
    healthPart({
      page: 22,
      section: '143RII STARTER',
      position: '10',
      name: 'POLIA',
      notes: 's/n up to 20161404745',
      normalizedPartNumber: '504114401',
    }),
    healthPart({
      page: 22,
      section: '143RII STARTER',
      position: '10',
      name: 'POLIA',
      notes: 's/n from 20162204746',
      normalizedPartNumber: '528755401',
    }),
  ]);
  assert.equal(diagnostics.conflictingOccurrenceCount, 0);
  assert.equal(diagnostics.variantOccurrenceCount, 1);
});

test('compact serial ranges from old IPLs are recognized as mutually exclusive variants', () => {
  const diagnostics = diagnoseCatalogStructure([
    healthPart({
      page: 3,
      section: '143RII GEAR',
      position: '14',
      name: 'ENGRENAGEM',
      notes: '20090100001-20113100000',
      normalizedPartNumber: '528826201',
    }),
    healthPart({
      page: 3,
      section: '143RII GEAR',
      position: '14',
      name: 'ENGRENAGEM',
      notes: '20113100001-Current',
      normalizedPartNumber: '579076701',
    }),
  ]);
  assert.equal(diagnostics.conflictingOccurrenceCount, 0);
  assert.equal(diagnostics.variantOccurrenceCount, 1);
});

test('market variants in the same catalog position are coverage, not corruption', () => {
  const diagnostics = diagnoseCatalogStructure([
    healthPart({
      page: 29,
      section: '143RII CARBURETTOR & AIR FILTER',
      position: '15',
      name: 'CARBURADOR',
      notes: 'ASIA, Latin America',
      normalizedPartNumber: '587106701',
    }),
    healthPart({
      page: 29,
      section: '143RII CARBURETTOR & AIR FILTER',
      position: '15',
      name: 'CARBURADOR',
      notes: 'EU',
      normalizedPartNumber: '587822501',
    }),
  ]);
  assert.equal(diagnostics.conflictingOccurrenceCount, 0);
  assert.equal(diagnostics.variantOccurrenceCount, 1);
});

test('generic section does not pretend two equal positions belong to the same exploded view', () => {
  const diagnostics = diagnoseCatalogStructure([
    healthPart({ page: 5, section: 'Peças', position: '46', normalizedPartNumber: '581473301' }),
    healthPart({ page: 5, section: 'Peças', position: '46', normalizedPartNumber: '591344801' }),
  ]);
  assert.equal(diagnostics.conflictingOccurrenceCount, 0);
  assert.equal(diagnostics.uncertainOccurrenceCount, 1);
});

test('a persisted PNC that contradicts its own For rule is a real application error', () => {
  const diagnostics = diagnoseCatalogStructure([
    healthPart({
      model: 'LB 155S',
      normalizedModel: 'LB155S',
      pnc: '96121003700',
      normalizedPnc: '96121003700',
      universalAcrossPnc: false,
      page: 4,
      section: 'Peças',
      position: '28',
      name: 'PARAFUSO BOLT CARRIAGE 5/16-18 1 For 96121002700',
      normalizedPartNumber: '586212501',
    }),
  ]);
  assert.equal(diagnostics.applicationMismatchCount, 1);

  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: 'LB 155S',
    extractedPncs: ['96121002700', '96121003700'],
    partCount: 50,
    partsWithPage: 50,
    partsWithSection: 50,
    partsWithPosition: 50,
    chunkCount: 5,
    embeddedPartCount: 50,
    applicationMismatchCount: diagnostics.applicationMismatchCount,
  });
  assert.equal(result.reviewStatus, 'NEEDS_REVIEW');
  assert.ok(result.reasons.some(reason => reason.includes('For/EXCEPT')));
});

test('large gap between extracted snapshot and persisted parts requires review', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: 'HU725AWD',
    snapshotPartCount: 120,
    partCount: 70,
    partsWithPage: 70,
    partsWithSection: 70,
    partsWithPosition: 70,
    chunkCount: 10,
    embeddedPartCount: 70,
  });
  assert.equal(result.reviewStatus, 'NEEDS_REVIEW');
  assert.ok(result.reasons.some(reason => reason.includes('120 linhas extraídas')));
});

test('model, PNC and malformed-code mismatches cannot be hidden by otherwise good coverage', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: 'LC 353AWD',
    pnc: '96145003301',
    partCount: 110,
    partsWithPage: 110,
    partsWithSection: 110,
    partsWithPosition: 110,
    chunkCount: 12,
    embeddedPartCount: 110,
    modelMismatchCount: 1,
    pncMismatchCount: 2,
    malformedPartNumberCount: 1,
  });
  assert.equal(result.reviewStatus, 'NEEDS_REVIEW');
  assert.ok(result.reasons.some(reason => reason.includes('modelo diferente')));
  assert.ok(result.reasons.some(reason => reason.includes('PNC diferente')));
  assert.ok(result.reasons.some(reason => reason.includes('formato estrutural inesperado')));
});

test('duplicate occurrences alone are surfaced as a warning without inventing a conflict', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: 'GX 560',
    partCount: 38,
    partsWithPage: 38,
    partsWithSection: 38,
    partsWithPosition: 38,
    chunkCount: 4,
    embeddedPartCount: 38,
    duplicateOccurrenceCount: 1,
  });
  assert.equal(result.reviewStatus, 'READY');
  assert.equal(result.score, 100);
  assert.ok(result.warnings.some(warning => warning.includes('duplicadas')));
  assert.ok(!result.reasons.some(reason => reason.includes('mais de um código')));
});

test('generic section labels do not pretend to provide mechanical view context', () => {
  assert.equal(isInformativeCatalogSection('Peças'), false);
  assert.equal(isInformativeCatalogSection('PARTS'), false);
  assert.equal(isInformativeCatalogSection('Lista de peças'), false);
  assert.equal(isInformativeCatalogSection('CLUTCH'), true);
  assert.equal(isInformativeCatalogSection('CUTTING EQUIPMENT'), true);

  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: 'LC 151',
    partCount: 80,
    partsWithPage: 80,
    partsWithSection: 80,
    partsWithInformativeSection: 0,
    partsWithPosition: 80,
    chunkCount: 8,
    embeddedPartCount: 80,
  });

  assert.equal(result.reviewStatus, 'READY');
  assert.equal(result.score, 100);
  assert.ok(result.warnings.some(warning => warning.includes('seção genérica')));
});

test('informative sections preserve a clean health result when view context is strong', () => {
  const result = assessCatalogHealth({
    manufacturer: 'Husqvarna',
    model: '372 XP',
    pnc: '965702302',
    partCount: 100,
    partsWithPage: 100,
    partsWithSection: 100,
    partsWithInformativeSection: 95,
    partsWithPosition: 100,
    chunkCount: 10,
    embeddedPartCount: 100,
  });

  assert.equal(result.reviewStatus, 'READY');
  assert.equal(result.score, 100);
  assert.ok(!result.warnings.some(warning => warning.includes('seção genérica')));
});
