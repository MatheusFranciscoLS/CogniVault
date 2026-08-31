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

test('reconhece South America only como aplicação da América Latina', () => {
  const rows = [
    { id: 'regional', notes: 'South America only' },
    { id: 'generic', notes: null },
  ];
  assert.deepEqual(filterCandidatesByMarket(rows, 'LATIN_AMERICA').map(row => row.id), ['regional']);
});

test('filtra mercado dentro da mesma posição sem remover peças de outras posições', () => {
  const base = { normalizedModel: '226R', normalizedPnc: null, universalAcrossPnc: true, page: 21, section: 'HANDLE' };
  const rows = [
    { ...base, id: 'regional-4', position: '4', name: 'PARAFUSO', notes: 'South America only' },
    { ...base, id: 'generic-4', position: '4', name: 'SCREW', notes: null },
    { ...base, id: 'generic-9', position: '9', name: 'PUNHO', notes: null },
  ];
  assert.deepEqual(filterCandidatesByMarket(rows, 'LATIN_AMERICA').map(row => row.id), ['regional-4', 'generic-9']);
});

test('considera indicação de mercado preservada no nome da peça', () => {
  const rows = [
    { id: 'latam', name: 'CORREIA South America only', notes: null },
    { id: 'eu', name: 'CORREIA EU version', notes: null },
  ];
  assert.deepEqual(filterCandidatesByMarket(rows, 'LATIN_AMERICA').map(row => row.id), ['latam']);
});
