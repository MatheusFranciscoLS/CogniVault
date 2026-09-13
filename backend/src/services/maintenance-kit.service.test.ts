import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMaintenanceKitMatches } from './maintenance-kit.service';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolver => {
        resolve = resolver;
    });
    return { promise, resolve };
}

test('maintenance kit starts every independent lookup before waiting for results', async () => {
    const items = [
        { category: 'air', label: 'Filtro de ar', searchTerms: ['filtro'] },
        { category: 'oil', label: 'Óleo', searchTerms: ['oleo'] },
        { category: 'spark', label: 'Vela', searchTerms: ['vela'] },
        { category: 'fuel', label: 'Filtro de combustível', searchTerms: ['combustivel'] },
    ];
    const gates = items.map(() => deferred<string | null>());
    const started: string[] = [];

    const pending = resolveMaintenanceKitMatches(items, item => {
        const index = items.indexOf(item);
        started.push(item.category);
        return gates[index].promise;
    });

    assert.deepEqual(started, ['air', 'oil', 'spark', 'fuel']);

    gates[3].resolve('fuel-part');
    gates[1].resolve('oil-part');
    gates[0].resolve('air-part');
    gates[2].resolve('spark-part');

    const result = await pending;
    assert.deepEqual(
        result.map(entry => [entry.kitItem.category, entry.matchingPart]),
        [
            ['air', 'air-part'],
            ['oil', 'oil-part'],
            ['spark', 'spark-part'],
            ['fuel', 'fuel-part'],
        ],
    );
});

test('maintenance kit keeps input order and removes categories without a matching part', async () => {
    const items = [
        { category: 'first', label: 'Primeiro', searchTerms: ['a'] },
        { category: 'missing', label: 'Ausente', searchTerms: ['b'] },
        { category: 'last', label: 'Último', searchTerms: ['c'] },
    ];

    const result = await resolveMaintenanceKitMatches(items, async item =>
        item.category === 'missing' ? null : `${item.category}-part`,
    );

    assert.deepEqual(
        result.map(entry => entry.kitItem.category),
        ['first', 'last'],
    );
});
