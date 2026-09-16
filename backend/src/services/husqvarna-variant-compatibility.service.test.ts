import test from 'node:test';
import assert from 'node:assert/strict';
import type { HusqvarnaOfficialProductDetails } from './husqvarna-official-detail.service';
import { evaluateLoadedVariantDetails } from './husqvarna-variant-compatibility.service';

function details(pnc: string, code: string | null, extraCode?: string): HusqvarnaOfficialProductDetails {
  return {
    pnc,
    productName: 'HUSQVARNA 143RII',
    categoryName: 'Roçadeiras',
    articleDescription: null,
    discontinued: false,
    equipment: null,
    documents: [],
    specifications: [],
    variants: [],
    features: [],
    accessories: [],
    alsoUsedIn: [],
    spareParts: [],
    iplSections: [{
      id: `HVA_PL-${pnc}`,
      name: 'CARBURETOR',
      imageUrl: null,
      referenceHeight: null,
      referenceWidth: null,
      parts: [
        ...(code ? [{ position: '1', partNumber: code, name: 'Carburetor', description: null, quantity: 1, comment: null, coordinates: null, url: null, replacementPartNumbers: [] }] : []),
        ...(extraCode ? [{ position: '1', partNumber: extraCode, name: 'Carburetor', description: null, quantity: 1, comment: 'serial split', coordinates: null, url: null, replacementPartNumbers: [] }] : []),
      ],
    }],
  };
}

const input = {
  model: '143RII',
  partNumber: '587106701',
  section: 'Carburetor',
  position: '1',
};

test('confirma peça quando o mesmo código aparece na mesma vista/posição de todas as variantes', () => {
  const loaded = new Map<string, HusqvarnaOfficialProductDetails>([
    ['967332904', details('967332904', '587106701')],
    ['967332905', details('967332905', '587106701')],
  ]);
  const decision = evaluateLoadedVariantDetails(input, loaded);
  assert.equal(decision.status, 'ALL_VARIANTS');
  assert.deepEqual(decision.variantPncs, ['967332904', '967332905']);
});

test('bloqueia compatibilidade ampla quando a mesma posição muda de código', () => {
  const loaded = new Map<string, HusqvarnaOfficialProductDetails>([
    ['967332904', details('967332904', '587106701')],
    ['967332905', details('967332905', '590000001')],
  ]);
  const decision = evaluateLoadedVariantDetails(input, loaded);
  assert.equal(decision.status, 'VARIES');
  assert.deepEqual(decision.variantCodes['967332905'], ['590000001']);
});

test('detecta variação por serial quando há mais de um código na mesma posição', () => {
  const loaded = new Map<string, HusqvarnaOfficialProductDetails>([
    ['967332904', details('967332904', '587106701', '590000001')],
  ]);
  const decision = evaluateLoadedVariantDetails(input, loaded);
  assert.equal(decision.status, 'VARIES');
});

test('não transforma ausência de evidência em incompatibilidade', () => {
  const loaded = new Map<string, HusqvarnaOfficialProductDetails>([
    ['967332904', details('967332904', null)],
  ]);
  const decision = evaluateLoadedVariantDetails(input, loaded);
  assert.equal(decision.status, 'INCONCLUSIVE');
});
