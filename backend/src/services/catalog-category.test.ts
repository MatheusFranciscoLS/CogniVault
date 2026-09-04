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
    assert.equal(inferCatalogCategory({ filename: 'Motor Kawasaki FR691.pdf', model: 'FR691' }), 'Motores');
    assert.equal(inferCatalogCategory({ filename: 'Motor Kawasaki FX921.pdf', model: 'FX921' }), 'Motores');
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

test('classifies Kawasaki and zero turn engines as Motores regardless of variation', () => {
    // Caso exato do usuário:
    assert.equal(inferCatalogCategory({ filename: 'Motor Kawasaki FX921.pdf', model: 'FX921V-ES06' }), 'Motores');
    // Apenas pelo nome do arquivo com a palavra motor:
    assert.equal(inferCatalogCategory({ filename: 'Motor Kawasaki FX921.pdf' }), 'Motores');
    // Com modelo completo de motor Kawasaki:
    assert.equal(inferCatalogCategory({ filename: 'FX921V-ES06.pdf', model: 'FX921V-ES06' }), 'Motores');
    assert.equal(inferCatalogCategory({ filename: 'Motor Kawasaki FR691.pdf', model: 'FR691V-AS04' }), 'Motores');
    assert.equal(inferCatalogCategory({ filename: 'Motor_Kawasaki_FS730V.pdf', model: 'FS730V' }), 'Motores');
    // Motores Kohler e Briggs:
    assert.equal(inferCatalogCategory({ filename: 'Motor Kohler KT745.pdf', model: 'KT745' }), 'Motores');
    assert.equal(inferCatalogCategory({ filename: 'Motor Briggs & Stratton Vanguard.pdf' }), 'Motores');

    // Casos de balcão: Motor de giro zero ou com marca no fabricante/modelo:
    assert.equal(inferCatalogCategory({ filename: 'Motor do Giro Zero.pdf' }), 'Motores');
    assert.equal(inferCatalogCategory({ filename: 'Motor Kawasaki FR691V (Giro Zero Z248F).pdf', model: 'Z248F' }), 'Motores');
    assert.equal(inferCatalogCategory({ filename: 'catalogo.pdf', manufacturer: 'Kawasaki' }), 'Motores');
    assert.equal(inferCatalogCategory({ filename: '115897626.pdf', model: 'Kawasaki FR691V' }), 'Motores');
    assert.equal(inferCatalogCategory({ filename: '115897626.pdf', model: 'Motor Z248F' }), 'Motores');
    assert.equal(inferCatalogCategory({
        filename: 'IPL-0003.pdf',
        parts: [
            { section: 'MOTOR', name: 'Virabrequim' },
            { section: 'MOTOR', name: 'Pistão' },
            { section: 'MOTOR', name: 'Biela' },
            { section: 'CARBURADOR', name: 'Carburador completo' },
        ],
    }), 'Motores');
});

test('keeps unknown catalogs in a safe fallback section', () => {
    assert.equal(inferCatalogCategory({ filename: 'catalogo.pdf', model: 'ABC123', parts: [] }), 'Outros / Não identificado');
});

