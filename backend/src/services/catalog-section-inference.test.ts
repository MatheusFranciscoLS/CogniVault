import assert from 'node:assert/strict';
import test from 'node:test';
import { inferCatalogSection } from './catalog-section-inference';

test('infere STARTER pelas linhas vendáveis', () => {
  assert.equal(inferCatalogSection([
    { name: 'CONJ. DO DISPOSITIVO DE ARRANQUE 15L Sprayer' },
    { name: 'CONJ. DA ROLDANA Starter 321S sprayer' },
    { name: 'MOLA DA BOBINA Coil Spring' },
    { name: 'PUNHO DE ARRANQUE STARTER HANDLE' },
    { name: 'PULLEY KIT' },
  ]), 'STARTER');
});

test('infere CRANKCASE & CLUTCHDRUM sem confundir com CLUTCH', () => {
  assert.equal(inferCatalogSection([
    { name: 'CRANKCASE KIT' }, { name: 'ROLAMENTO DE ESFERAS 6001 C3' },
    { name: 'VOLANTE Flywheel' }, { name: 'BOBINA DE IGNIÇÃO Coil Assy' },
    { name: 'CONJ DE EMBRAIAGEM' },
  ]), 'CRANKCASE & CLUTCHDRUM');
});

test('infere CLUTCH quando o tambor domina a tabela', () => {
  assert.equal(inferCatalogSection([
    { name: 'CONJ DE EMBRAIAGEM Clutch Assy' },
    { name: 'TAMBOR DE EMBRAIAGEM Clutch Drum' },
    { name: 'ANEL DE RETENÇÃO Retainer Ring Kit' },
    { name: 'ROLAMENTO Bearing' },
  ]), 'CLUTCH');
});