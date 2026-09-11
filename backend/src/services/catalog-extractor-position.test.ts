import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHusqvarnaIplText } from './catalog-extractor';

const rows = [
  '1 532 10 00-01 PARAFUSO 1',
  '2 532 10 00-02 PORCA 1',
  '3 532 10 00-03 ARRUELA 1',
  '4 532 10 00-04 SUPORTE 1',
  '5 532 10 00-05 CABO 1',
  '6 532 10 00-06 MOLA 1',
  '7 532 10 00-07 RODA 1',
  '8 532 10 00-08 EIXO 1',
  '9 532 10 00-09 TAMPA 1',
  '10 532 10 00-10 MANIPULO 1',
  '- - 532 42 38-49 Bag of Parts 1',
  '-- 115 63 62-96 Operator Manual English Spanish 1',
];

test('parser não inventa callout para linhas com KEY/REF em traço', () => {
  const text = [
    'IPL SPARE PARTS LIST',
    'KEY PART NO DESCRIPTION QTY',
    ...rows,
  ].join('\n');

  const extraction = parseHusqvarnaIplText(text, {
    manufacturer: 'Husqvarna',
    model: 'HU725AWD',
    pnc: '96145001703',
    filename: 'HU725AWD.pdf',
  });

  assert.ok(extraction);
  const bag = extraction.parts.find(part => part.partNumber === '532 42 38-49');
  const manual = extraction.parts.find(part => part.partNumber === '115 63 62-96');

  assert.equal(bag?.position, '');
  assert.equal(bag?.positionStatus, 'SOURCE_UNPOSITIONED');
  assert.match(bag?.positionEvidence || '', /-/);
  assert.equal(manual?.position, '');
  assert.equal(manual?.positionStatus, 'SOURCE_UNPOSITIONED');
});
