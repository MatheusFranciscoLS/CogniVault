import assert from 'node:assert/strict';
import test from 'node:test';
import { extractCatalogJson, parseBrlPrice, parsePriceListHtml } from './price-list-html';

// Fixture sintética: códigos e preços inventados, só a forma do arquivo real.
function page(catalog: Record<string, unknown>): string {
  return `<!DOCTYPE html><html><body><script id="catalogData" type="application/json">${JSON.stringify(catalog)}</script></body></html>`;
}

const empty = { pecas: [], acessorios: [], lubrificantes: [], ferramentas: [] };

test('parseBrlPrice lê o formato brasileiro e recusa o resto', () => {
  assert.equal(parseBrlPrice('R$ 22,00'), 22);
  assert.equal(parseBrlPrice('R$ 9.171,00'), 9171);
  assert.equal(parseBrlPrice('R$ 1.234.567,89'), 1234567.89);
  assert.equal(parseBrlPrice('R$ 0,11'), 0.11);
  assert.equal(parseBrlPrice('  R$ 5,50 '), 5.5);
  // Preço mal formado não vira número: ler errado é pior que não atualizar.
  for (const bad of ['22.5', 'R$ 1,5', 'R$ 12', 'R$ 1.23,00', 'R$ -3,00', '', 'abc', null, undefined, 22]) {
    assert.equal(parseBrlPrice(bad), null, `deveria recusar ${String(bad)}`);
  }
});

test('lê as quatro listas e junta o mesmo código de vários modelos', () => {
  const result = parsePriceListHtml(
    page({
      ...empty,
      pecas: [
        { codigo: '505 28-33-09', descricao: 'PEÇA A', preco: 'R$ 22,00', classif_fiscal: '73269090', ean: '' },
        { codigo: '505283309', descricao: 'PEÇA A', preco: 'R$ 22,00', classif_fiscal: '73269090', ean: '' },
      ],
      acessorios: [{ codigo: '587394460', descricao: 'ACESSÓRIO', preco: 'R$ 341,99', ean: '789' }],
      lubrificantes: [{ codigo: '598592101', descricao: 'GRAXA', preco: 'R$ 51,99' }],
      ferramentas: [{ codigo: '547404635', descricao: 'AFIADOR', preco: 'R$ 269,00' }],
      produtos: [{ pnc: '967796301', descricao: 'MOTOSSERRA' }],
    }),
  );

  assert.equal(result.items.length, 4);
  assert.equal(result.stats.rows, 5);
  assert.equal(result.stats.uniqueCodes, 4);
  const clamp = result.items.find(item => item.normalizedNumber === '505283309');
  assert.ok(clamp);
  assert.equal(clamp.consumerPrice, 22);
  assert.equal(clamp.ncm, '73269090');
  assert.equal(clamp.ean, null, 'campo vazio é null, nunca string vazia');
  assert.equal(clamp.section, 'pecas');
  // Máquina (produtos) não entra neste cadastro.
  assert.ok(!result.items.some(item => item.partNumber === '967796301'));
});

test('código com dois preços diferentes é recusado, não escolhido', () => {
  const result = parsePriceListHtml(
    page({
      ...empty,
      pecas: [
        { codigo: '594028101', descricao: 'X', preco: 'R$ 10,00' },
        { codigo: '594028101', descricao: 'X', preco: 'R$ 9.171,00' },
        { codigo: '594028101', descricao: 'X', preco: 'R$ 10,00' },
        { codigo: '111111111', descricao: 'Y', preco: 'R$ 1,00' },
      ],
    }),
  );

  assert.deepEqual(result.rejected, [
    { normalizedNumber: '594028101', reason: 'PRECO_CONFLITANTE', prices: [10, 9171] },
  ]);
  assert.deepEqual(result.items.map(item => item.normalizedNumber), ['111111111']);
});

test('linha sem código ou com preço fora do padrão é contada e não entra', () => {
  const result = parsePriceListHtml(
    page({
      ...empty,
      pecas: [
        { codigo: '', descricao: 'sem código', preco: 'R$ 1,00' },
        { codigo: '-', descricao: 'traço', preco: 'R$ 1,00' },
        { codigo: '222222222', descricao: 'preço ruim', preco: '1.5' },
        { codigo: '333333333', descricao: 'ok', preco: 'R$ 3,00' },
      ],
    }),
  );

  assert.equal(result.stats.rowsWithoutCode, 2);
  assert.equal(result.stats.rowsWithBadPrice, 1);
  assert.deepEqual(result.items.map(item => item.normalizedNumber), ['333333333']);
});

test('arquivo que não é a lista de preços falha com mensagem clara', () => {
  assert.throws(() => extractCatalogJson('<html></html>'), /catalogData não encontrado/);
  assert.throws(
    () => extractCatalogJson('<script id="catalogData" type="application/json">{quebrado</script>'),
    /não é JSON válido/,
  );
  assert.throws(() => extractCatalogJson('<script id="catalogData">[1,2]</script>'), /formato esperado/);
  assert.throws(() => parsePriceListHtml(page({ pecas: [] })), /Lista "acessorios" não encontrada/);
});
