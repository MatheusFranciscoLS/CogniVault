import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBrlPrice, parsePriceListCatalog, parsePriceListHtml } from './price-list-html';

// A lista de preços testada de VÁRIAS FORMAS (plano 2.3, pedido do dono: "foque sempre na lista de preço"). Tudo INVENTADO, só a forma do arquivo real.
const empty = { pecas: [], acessorios: [], lubrificantes: [], ferramentas: [] };
const lista = (over: Record<string, unknown>) => parsePriceListCatalog({ ...empty, ...over });
const linha = (codigo: unknown, preco: unknown, extra: Record<string, unknown> = {}) => ({ codigo, descricao: 'PEÇA', preco, modelo: 'M', ...extra });

test('formatos de preço: o que a Husqvarna escreve entra; o que é ambíguo ou estranho é recusado, nunca adivinhado', () => {
  const aceitos: Array<[unknown, number]> = [
    ['R$ 22,00', 22], ['R$ 9.171,00', 9171], ['R$ 1.234.567,89', 1234567.89], ['R$ 0,01', 0.01], ['R$ 1234,56', 1234.56],
    ['R$1.234,56', 1234.56], ['  R$ 5,50  ', 5.5], ['R$ 10,00', 10], ['R$\t10,00', 10], ['R$ 10,10', 10.1], ['R$ 100,00', 100],
  ];
  for (const [texto, valor] of aceitos) assert.equal(parseBrlPrice(texto), valor, JSON.stringify(texto));

  const recusados: unknown[] = [
    'R$ 0,00', 'R$ 00,00', 'R$ 1,5', 'R$ 1,567', 'R$ 12', 'R$ 1.23,00', 'R$ 1.2345,00', 'R$ 1,234.56', 'R$ -3,00', 'R$ +3,00', 'RS 10,00', 'R$ 10,00 a vista',
    'R$  10,00', '10,00', 'R$', 'R$ ,50', 'R$ 1e3,00', 'R$ 1 000,00', 'R$ 10.00', '', ' ', 'abc', 'dez reais', null, undefined, 10, 10.5, NaN, true, {}, [],
  ];
  for (const texto of recusados) assert.equal(parseBrlPrice(texto), null, JSON.stringify(texto));
});

test('códigos escritos de formas diferentes viram o MESMO código; e o código original fica como veio', () => {
  const resultado = lista({
    pecas: [
      linha('587 10 67-01', 'R$ 10,00'),
      linha('587106701', 'R$ 10,00', { modelo: 'OUTRO' }),
      linha('  587-10-67-01 ', 'R$ 10,00', { modelo: 'MAIS UM' }),
      linha('fx921vhs04s', 'R$ 20,00'),
      linha('FX921VHS04S', 'R$ 20,00'),
    ],
  });
  assert.deepEqual(resultado.items.map(item => item.normalizedNumber).sort(), ['587106701', 'FX921VHS04S']);
  const primeiro = resultado.items.find(item => item.normalizedNumber === '587106701')!;
  assert.equal(primeiro.partNumber, '587 10 67-01', 'o código de exibição é o da primeira linha');
  assert.equal(primeiro.applications.length, 3, 'três modelos diferentes');
  assert.deepEqual(resultado.rejected, []);
});

test('o mesmo código com preços diferentes escrito de formas diferentes continua sendo conflito', () => {
  const resultado = lista({ pecas: [linha('ZQ 100', 'R$ 10,00'), linha('zq-100', 'R$ 11,00')] });
  assert.deepEqual(resultado.rejected, [{ normalizedNumber: 'ZQ100', reason: 'PRECO_CONFLITANTE', prices: [10, 11] }]);
  assert.deepEqual(resultado.items, []);
});

test('o mesmo código em duas listas (peças e acessórios): igual une, diferente conflita; vale a lista que o leu primeiro', () => {
  const igual = lista({ pecas: [linha('ZQ1', 'R$ 10,00')], acessorios: [linha('ZQ1', 'R$ 10,00')] });
  assert.equal(igual.items.length, 1);
  assert.equal(igual.items[0].section, 'pecas');
  const diferente = lista({ pecas: [linha('ZQ1', 'R$ 10,00')], ferramentas: [linha('ZQ1', 'R$ 12,00')] });
  assert.equal(diferente.items.length, 0);
  assert.equal(diferente.rejected.length, 1);
});

test('linhas que não são linha: lixo é contado como "sem código", nunca derruba a leitura', () => {
  const resultado = lista({ pecas: [null, undefined, 42, 'texto', [], {}, { codigo: null, preco: 'R$ 1,00' }, { codigo: 12345, preco: 'R$ 1,00' }, linha('ZQ1', 'R$ 1,00')] });
  assert.deepEqual(resultado.items.map(item => item.normalizedNumber), ['ZQ1']);
  assert.equal(resultado.stats.rows, 9);
  assert.equal(resultado.stats.rowsWithoutCode, 8, 'código que não é texto também não vale (um número pode ter perdido o zero da frente)');
  assert.equal(resultado.stats.uniqueCodes, 1);
});

test('descrição: vazia, só traço ou com quebra de linha vira texto limpo; sem descrição usa o código', () => {
  const resultado = lista({ pecas: [
    { codigo: 'ZQ1', preco: 'R$ 1,00' },
    { codigo: 'ZQ2', descricao: '   ', preco: 'R$ 1,00' },
    { codigo: 'ZQ3', descricao: '-', preco: 'R$ 1,00' },
    { codigo: 'ZQ4', descricao: '  CARBURADOR\n  COMPLETO\t143R  ', preco: 'R$ 1,00' },
    { codigo: 'ZQ5', descricao: 42, preco: 'R$ 1,00' },
  ] });
  assert.deepEqual(resultado.items.map(item => item.name), ['ZQ1', 'ZQ2', 'ZQ3', 'CARBURADOR COMPLETO 143R', 'ZQ5']);
});

test('chaves desconhecidas e listas extras são ignoradas; lista obrigatória ausente ou do tipo errado falha dizendo qual', () => {
  const comExtras = lista({ pecas: [linha('ZQ1', 'R$ 1,00', { imagem: 'data:image/png;base64,AAAA', campo_novo: { a: 1 } })], produtos: [{ codigo: 'MAQ' }], similaridade: [1, 2, 3], novidade: 'x' });
  assert.equal(comExtras.items.length, 1);

  for (const secao of ['pecas', 'acessorios', 'lubrificantes', 'ferramentas']) {
    for (const ruim of [undefined, null, 'texto', 7, {}]) {
      assert.throws(() => parsePriceListCatalog({ ...empty, [secao]: ruim }), new RegExp(`Lista "${secao}" não encontrada`), `${secao}=${JSON.stringify(ruim)}`);
    }
  }
});

test('o mesmo arquivo linha a linha repetido mil vezes é UM código, com uma aplicação só', () => {
  const resultado = lista({ pecas: Array.from({ length: 1000 }, () => linha('ZQ1', 'R$ 10,00')) });
  assert.equal(resultado.items.length, 1);
  assert.equal(resultado.items[0].applications.length, 1);
  assert.equal(resultado.stats.rows, 1000);
  assert.equal(resultado.stats.uniqueCodes, 1);
});

test('lista grande: 120 mil linhas (cinco vezes a real) leem em segundos e sem perder nenhum código', () => {
  const linhas = Array.from({ length: 120_000 }, (_, i) => linha(`ZZ${String(i).padStart(7, '0')}`, `R$ ${(i % 900) + 10},00`, { modelo: `M${i % 400}`, categoria: 'TESTE' }));
  const inicio = performance.now();
  const resultado = lista({ pecas: linhas });
  const segundos = (performance.now() - inicio) / 1000;
  assert.equal(resultado.items.length, 120_000);
  assert.equal(resultado.stats.uniqueCodes, 120_000);
  assert.ok(segundos < 10, `levou ${segundos.toFixed(1)} s`);
});

test('arquivo que é HTML mas não é a lista: mensagem clara, em português', () => {
  for (const html of ['', '<html></html>', '<script id="catalogData" type="application/json">', '<script id="catalogData" type="application/json">não é json</script>', '<script id="catalogData" type="application/json">[1,2]</script>', '<script id="catalogData" type="application/json">"texto"</script>']) {
    assert.throws(() => parsePriceListHtml(html), /catalogData|não parece|não é JSON|formato/i, html.slice(0, 50));
  }
});

test('duas linhas do mesmo código com preços iguais escritos de jeitos diferentes não são conflito', () => {
  const resultado = lista({ pecas: [linha('ZQ1', 'R$ 1.000,00'), linha('ZQ1', 'R$ 1000,00'), linha('ZQ1', 'R$ 1.000,00')] });
  assert.equal(resultado.rejected.length, 0);
  assert.equal(resultado.items[0].consumerPrice, 1000);
});

test('NCM e EAN vêm da primeira linha do código; "-" e vazio viram nulo', () => {
  const resultado = lista({ pecas: [
    linha('ZQ1', 'R$ 1,00', { classif_fiscal: '8407.34.90', ean: '7891234567890' }),
    linha('ZQ2', 'R$ 1,00', { classif_fiscal: '-', ean: '' }),
    linha('ZQ3', 'R$ 1,00'),
  ] });
  const por = Object.fromEntries(resultado.items.map(item => [item.normalizedNumber, item]));
  assert.deepEqual([por.ZQ1.ncm, por.ZQ1.ean], ['8407.34.90', '7891234567890']);
  assert.deepEqual([por.ZQ2.ncm, por.ZQ2.ean, por.ZQ3.ncm, por.ZQ3.ean], [null, null, null, null]);
});
