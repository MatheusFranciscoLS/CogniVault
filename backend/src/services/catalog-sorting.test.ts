import assert from 'node:assert/strict';
import test from 'node:test';

function naturalCatalogCompare(aName: string, bName: string): number {
    return aName.localeCompare(bName, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

test('naturalCatalogCompare sorts Husqvarna models in natural alphanumeric sequence (142R, 143RII, 143RS)', () => {
    const list = ['143RS', '142R', '143RII', '236e', '120 Mark II', '345FR', '555FX'];
    list.sort(naturalCatalogCompare);

    assert.deepEqual(list, [
        '120 Mark II',
        '142R',
        '143RII',
        '143RS',
        '236e',
        '345FR',
        '555FX',
    ]);
});

test('naturalCatalogCompare handles numeric sequence correctly without lexical skew', () => {
    // Lexical sorting would put 10 before 2 (e.g. 1, 10, 2).
    // Natural sorting ensures 1, 2, 10, 100.
    const models = ['Modelo 10', 'Modelo 2', 'Modelo 1', 'Modelo 100', 'Modelo 20'];
    models.sort(naturalCatalogCompare);

    assert.deepEqual(models, [
        'Modelo 1',
        'Modelo 2',
        'Modelo 10',
        'Modelo 20',
        'Modelo 100',
    ]);
});

test('naturalCatalogCompare handles complex model names with revisions and suffixes', () => {
    const models = [
        'Husqvarna 143R-II',
        'Husqvarna 142R',
        'Husqvarna 143R',
        'Husqvarna 143RS',
    ];
    models.sort(naturalCatalogCompare);

    assert.equal(models[0], 'Husqvarna 142R');
    assert.equal(models[1], 'Husqvarna 143R');
    // 143R-II comes before 143RS
    assert.equal(models[2], 'Husqvarna 143R-II');
    assert.equal(models[3], 'Husqvarna 143RS');
});
