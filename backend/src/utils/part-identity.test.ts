import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPartIdentity, countDistinctPartOccurrences, hasSafeExtractionCoverage, identifyParts, matchExistingPartIds } from './part-identity';

test('normaliza formatações diferentes do mesmo código para a mesma identidade', () => {
    const formatted = buildPartIdentity({
        model: '143 RS',
        pnc: '967 33 26-01',
        partNumber: '537 04 19-01',
        section: 'Carburador',
        position: '12',
    });
    const compact = buildPartIdentity({
        model: '143RS',
        pnc: '967332601',
        partNumber: '537041901',
        section: 'carburador',
        position: '12',
    });

    assert.equal(formatted, compact);
});

test('mantém ocorrências repetidas com chaves de origem distintas', () => {
    const parts = identifyParts([
        { model: '143RS', pnc: 'A', partNumber: '123', section: 'Motor', position: '1' },
        { model: '143RS', pnc: 'A', partNumber: '123', section: 'Motor', position: '1' },
    ]);

    assert.equal(parts[0].occurrence, 1);
    assert.equal(parts[1].occurrence, 2);
    assert.notEqual(parts[0].sourceKey, parts[1].sourceKey);
});

test('reutiliza IDs existentes para preservar feedbacks e favoritos', () => {
    const prepared = [
        { model: '143 RS', pnc: 'A-1', partNumber: '537 04 19-01', section: 'Motor', position: '12' },
        { model: '143 RS', pnc: 'A-1', partNumber: '999', section: 'Motor', position: '13' },
    ];
    const existing = [
        { id: 'part-existing', model: '143RS', pnc: 'A1', partNumber: '537041901', section: 'motor', position: '12' },
    ];

    const matches = matchExistingPartIds(prepared, existing);

    assert.equal(matches[0].existingId, 'part-existing');
    assert.equal(matches[1].existingId, null);
});

test('bloqueia uma reextração incompleta antes de aposentar peças válidas', () => {
    assert.equal(hasSafeExtractionCoverage(100, 49), false);
    assert.equal(hasSafeExtractionCoverage(100, 50), true);
    assert.equal(hasSafeExtractionCoverage(0, 1), true);
});

test('cobertura de reextração conta a ocorrência física sem multiplicar variantes de PNC', () => {
    const previous = [
        { model: 'LC151', pnc: '970488401', partNumber: '532123401', section: 'DECK', position: '1', page: 8 },
        { model: 'LC151', pnc: '970488402', partNumber: '532123401', section: 'DECK', position: '1', page: 8 },
        { model: 'LC151', pnc: '970488401', partNumber: '532567801', section: 'DECK', position: '2', page: 8 },
    ];
    const next = [
        { model: 'LC151', pnc: null, universalAcrossPnc: true, partNumber: '532123401', section: 'DECK', position: '1', page: 8 },
        { model: 'LC151', pnc: null, universalAcrossPnc: true, partNumber: '532567801', section: 'DECK', position: '2', page: 8 },
    ];

    assert.equal(countDistinctPartOccurrences(previous), 2);
    assert.equal(countDistinctPartOccurrences(next), 2);
    assert.equal(hasSafeExtractionCoverage(
        countDistinctPartOccurrences(previous),
        countDistinctPartOccurrences(next),
    ), true);
});
