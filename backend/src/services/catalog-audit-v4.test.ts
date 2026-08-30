import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLegacyRefCatalog } from './catalog-legacy-ref-parser';
import { detectTrustedCatalogModel, isPlausibleCatalogModel } from './catalog-model-detection';
import { countCatalogSourceRows } from './catalog-extraction-integrity';

test('prefers official Portal evidence over a wrong filename and line-like model candidates', () => {
  const text = `
    1 527917801 TAMPA Cover 1
    MODEL NUMBER: assy 321S
    Roçadeira Roçadeira Husqvarna 321R Husqvarna | Husqvarna Portal BR
    https://portal.husqvarnagroup.com/br/rocadeiras/rocadeira-husqvarna-321r/?printipl=true&iplId=HVA_PL-1
  `;
  assert.equal(detectTrustedCatalogModel(text, { filename: 'Roçadeira Husqvarna 999R.pdf' }), '321R');
  assert.equal(isPlausibleCatalogModel('FIOS'), false);
  assert.equal(isPlausibleCatalogModel('assy 321S'), false);
  assert.equal(isPlausibleCatalogModel('1 527917801 TAMPA'), false);
});

test('uses Portal content instead of an incorrect local filename such as 345BT -> 340BT', () => {
  const text = `
    Soprador Husqvarna 340BT Husqvarna | Husqvarna Portal BR
    https://portal.husqvarnagroup.com/br/sopradores/soprador-husqvarna-340bt/?printipl=true&iplId=HVA_PL-1
  `;
  assert.equal(detectTrustedCatalogModel(text, { filename: 'Soprador de folhas costal Husqvarna 345BT.pdf' }), '340BT');
});

test('parses old REF/PART NO layout without inventing exploded-view positions', () => {
  const text = `142 R, 20001900001-Current\f
SPARE PARTS LIST\f
REF. PART NO. DESCRIPTION REMARK QTY. KIT
531 00 77-
  531007734 CLUTCH COVER 1
34
725 23 74-
  725237471 SCREW EHHM 1
71
725 53 70-
  725537001 SCREW IHSCM 1
01
531 00 77-
  531007774 BUMPER 1
74
531 00 77-
  531007773 BUMPER 1
73
531 00 77-
  531007776 WASHER 1
76
735 31 33-
  735313310 CIRCLIP 1
10
723 23 29-
  723232931 SCREW SLPANM 1
31
735 11 46-
  735114601 SPRING WASHER 1
01
531 00 77-
  531007771 CLUTCH COVER 1
71
`;
  const extraction = parseLegacyRefCatalog(text, { filename: 'Roçadeira Husqvarna 142R.pdf' });
  assert.ok(extraction);
  assert.equal(extraction.models[0], '142R');
  assert.equal(extraction.parts.length, 10);
  assert.equal(extraction.parts[0].partNumber, '531007734');
  assert.equal(extraction.parts[0].position, '');
  assert.match(extraction.parts[0].notes, /REF: 531 00 77-34/);
  assert.equal(countCatalogSourceRows(extraction), 10);
});

test('source-row count ignores PNC expansion of one physical catalog row', () => {
  const base = {
    manufacturer: 'Husqvarna', model: 'TS114', universalAcrossPnc: false,
    section: 'DECK', position: '5', name: 'POLIA', alternativeNames: [],
    partNumber: '500000001', page: 10, notes: 'For 970622401 970622402',
  };
  const extraction = {
    manufacturer: 'Husqvarna', models: ['TS114'], pncs: ['970622401', '970622402'],
    parts: [
      { ...base, pnc: '970622401' },
      { ...base, pnc: '970622402' },
    ],
  };
  assert.equal(countCatalogSourceRows(extraction), 1);
});
