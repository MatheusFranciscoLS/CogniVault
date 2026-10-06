import assert from 'node:assert/strict';
import test from 'node:test';
import {
  explicitManufacturerFromFilename,
  isHusqvarnaManufacturer,
  resolveManufacturerEvidence,
} from './manufacturer-provenance';

test('fabricante desconhecido continua desconhecido', () => {
  assert.equal(resolveManufacturerEvidence({ filename: 'catalogo tecnico 123.pdf' }), null);
});

test('fabricante explícito da peça tem precedência sobre documento e arquivo', () => {
  assert.equal(resolveManufacturerEvidence({
    partManufacturer: 'Kawasaki',
    documentManufacturer: 'Husqvarna',
    filename: 'Husqvarna 143RII.pdf',
  }), 'Kawasaki');
});

test('nome do arquivo só resolve marcas escritas explicitamente', () => {
  assert.equal(explicitManufacturerFromFilename('Motor Kawasaki FX921V.pdf'), 'Kawasaki');
  assert.equal(explicitManufacturerFromFilename('Motor Briggs 104M02.pdf'), 'Briggs & Stratton');
  assert.equal(explicitManufacturerFromFilename('Husqvarna 143RII IPL.pdf'), 'Husqvarna');
  assert.equal(explicitManufacturerFromFilename('15004-0937 FX921V.pdf'), null);
});

test('checagem Husqvarna não promove fabricante ausente', () => {
  assert.equal(isHusqvarnaManufacturer(null), false);
  assert.equal(isHusqvarnaManufacturer(''), false);
  assert.equal(isHusqvarnaManufacturer('Kawasaki'), false);
  assert.equal(isHusqvarnaManufacturer('Husqvarna'), true);
});
