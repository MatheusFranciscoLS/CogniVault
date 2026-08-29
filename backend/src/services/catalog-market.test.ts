import assert from 'node:assert/strict';
import test from 'node:test';
import { filterCandidatesByMarket } from './catalog-market';

test('mantém variantes Latin America e remove a alternativa EU quando o mercado está configurado', () => {
  const rows = [
    { id: 'latam', notes: 'ASIA, Latin America' },
    { id: 'eu', notes: 'EU' },
    { id: 'generic', notes: null },
  ];
  assert.deepEqual(filterCandidatesByMarket(rows, 'LATIN_AMERICA').map(row => row.id), ['latam']);
});

test('não elimina candidatos quando o catálogo não informa o mercado preferido', () => {
  const rows = [{ id: 'eu', notes: 'EU' }, { id: 'generic', notes: null }];
  assert.deepEqual(filterCandidatesByMarket(rows, 'LATIN_AMERICA'), rows);
});
