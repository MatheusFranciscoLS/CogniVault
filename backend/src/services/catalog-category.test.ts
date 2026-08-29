import assert from 'node:assert/strict';
import test from 'node:test';
import { inferCatalogCategory } from './catalog-category';

test('classifies known Husqvarna catalog families from filename and model evidence', () => {
    assert.equal(inferCatalogCategory({ filename: 'Roçadeira Husqvarna 143RII.pdf', model: '143RII' }), 'Roçadeiras');
    assert.equal(inferCatalogCategory({ filename: 'Motosserra Husqvarna 372 XP.pdf', model: '372 XP' }), 'Motosserras');
    assert.equal(inferCatalogCategory({ filename: 'Trator Husqvarna TS 114.pdf', model: 'TS114' }), 'Tratores');
    assert.equal(inferCatalogCategory({ filename: 'Cortador Husqvarna LC 353AWD.pdf', model: 'LC353AWD' }), 'Cortadores de grama');
    assert.equal(inferCatalogCategory({ filename: 'Giro zero Husqvarna Z460.pdf', model: 'Z460' }), 'Giro zero');
    assert.equal(inferCatalogCategory({ filename: 'Soprador Husqvarna 578BTF.pdf', model: '578BTF' }), 'Sopradores');
    assert.equal(inferCatalogCategory({ filename: 'Motor Husqvarna HV764.pdf', model: 'HV764' }), 'Motores');
    assert.equal(inferCatalogCategory({ filename: 'Pulverizador Husqvarna 321S25.pdf', model: '321S25' }), 'Pulverizadores');
    assert.equal(inferCatalogCategory({ filename: 'Podador Husqvarna 525P5S.pdf', model: '525P5S' }), 'Podadores');
    assert.equal(inferCatalogCategory({ filename: 'Husqvarna 525LK.pdf', model: '525LK' }), 'Multifuncionais');
    assert.equal(inferCatalogCategory({ filename: 'Aparador de cerca viva 122HD60.pdf', model: '122HD60' }), 'Aparadores de cerca-viva');
    assert.equal(inferCatalogCategory({ filename: 'Rider Husqvarna R316TX.pdf', model: 'R316TX' }), 'Rider / cortadores frontais');
});

test('uses mechanical architecture when filename is generic', () => {
    assert.equal(inferCatalogCategory({
        filename: 'IPL-0001.pdf',
        model: '125B',
        parts: [
            { section: 'FAN HOUSING', name: 'OUTER SCROLL' },
            { section: 'FAN HOUSING', name: 'IMPELLER' },
        ],
    }), 'Sopradores');

    assert.equal(inferCatalogCategory({
        filename: 'IPL-0002.pdf',
        model: '321S25',
        parts: [
            { section: 'PUMP', name: 'PUMP PISTON' },
            { section: 'SPRAY EQUIPMENT', name: 'PRESSURE HOSE' },
            { section: 'SPRAY EQUIPMENT', name: 'LANCE' },
            { section: 'SPRAY EQUIPMENT', name: 'NOZZLE' },
        ],
    }), 'Pulverizadores');
});

test('keeps unknown catalogs in a safe fallback section', () => {
    assert.equal(inferCatalogCategory({ filename: 'catalogo.pdf', model: 'ABC123', parts: [] }), 'Outros / Não identificado');
});
