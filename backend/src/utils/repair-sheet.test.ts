import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { cleanLocation, davFromFileName, normalizeRepairLeadTime, parseRepairSheet, toNumber } from './repair-sheet';

// Planilhas SINTÉTICAS no formato das "ORÇAMENTO DAV ####.xlsx" da loja (nenhum arquivo nem cliente real entra no repositório, que é público).

function book(sheets: Array<[string, unknown[][]]>, bookType: XLSX.BookType = 'xlsx'): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(wb, { type: 'buffer', bookType }) as Buffer;
}
const HEADER = ['CÓDIGO', 'DESCRIÇÃO', 'QTDE', 'VALOR UNIT', 'VALOR TOTAL', 'PRAZO'];

test('o número da OS vem do nome do arquivo, de qualquer jeito que a loja escreve', () => {
  assert.equal(davFromFileName('ORÇAMENTO DAV 59600.xlsx'), '59600');
  assert.equal(davFromFileName('ORCAMENTO_DAV_59600 (1).xls'), '59600');
  assert.equal(davFromFileName('C:\\pasta\\ORÇAMENTO DAV 00123.xlsx'), '123');
  assert.equal(davFromFileName('AGRALE MICHAEL.xlsx'), null);
  assert.equal(davFromFileName('ARQUIVO BASE EXCEL.xlsx'), null);
});

test('o prazo como o balcão escreve: estoque vira Pronta entrega, número solto (data do Excel) não é prazo', () => {
  for (const text of ['IMEDIATO', 'imediata', 'Disponível', 'ESTOQUE', ' em estoque ']) assert.equal(normalizeRepairLeadTime(text), 'Pronta entrega', text);
  assert.equal(normalizeRepairLeadTime('7 DIAS'), '7 dias');
  assert.equal(normalizeRepairLeadTime('7/10 DIAS'), '7/10 dias');
  assert.equal(normalizeRepairLeadTime('VERIFICAR'), 'Verificar');
  for (const empty of [44927, '44927', '', '   ', null, undefined, new Date()]) assert.equal(normalizeRepairLeadTime(empty), undefined, String(empty));
});

test('prateleira: como está na planilha, sem o traço de "sem local"', () => {
  assert.equal(cleanLocation(' p14-c2 '), 'P14-C2');
  assert.equal(cleanLocation('PF'), 'PF');
  for (const vazio of ['', '  ', '-', '--', null, undefined, {}]) assert.equal(cleanLocation(vazio), null, String(vazio));
  assert.equal(cleanLocation('x'.repeat(100))?.length, 40);
});

test('números como a planilha escreve', () => {
  assert.equal(toNumber(27), 27);
  assert.equal(toNumber('27,5'), 27.5);
  assert.equal(toNumber('R$ 1.234,56'), 1234.56);
  assert.equal(toNumber('0,3'), 0.3);
  for (const bad of ['', 'abc', 'VALOR UNIT', null, undefined, {}]) assert.ok(Number.isNaN(toNumber(bad)), String(bad));
});

test('planilha padrão: linhas, prazo por linha, mão de obra como serviço, total conferido, sem custo', () => {
  const bytes = book([
    ['BASE ORÇAMENTO', [
      [...HEADER, 'COOPER'],
      ['VI25463', 'JOGO DE JUNTAS', 1, 20, 20, '7 DIAS', 6.9],
      ['4203-020-1201 ', 'KIT CILINDRO', 2, 100, 200, '7 DIAS', 62],
      ['503443201-2', 'FILTRO GASOLINA', 1, 18, 18, 'IMEDIATO', 5],
      [null, 'MÃO DE OBRA', 1, 220, 220, 'IMEDIATO'],
      [null, null, null, 'TOTAL', 458],
    ]],
    ['PLAN1', [['custo interno', 999]]],
  ]);
  const r = parseRepairSheet(bytes, 'ORÇAMENTO DAV 59600.xlsx');
  assert.equal(r.status, 'OK');
  if (r.status !== 'OK') return;
  assert.equal(r.dav, '59600');
  assert.equal(r.items.length, 4);
  assert.deepEqual(r.items.map(item => item.partNumber), ['VI25463', '42030201201', '5034432012', 'SRV-4']);
  assert.deepEqual(r.items.map(item => item.leadTime), ['7 dias', '7 dias', 'Pronta entrega', 'Pronta entrega']);
  assert.equal(r.items[3].isService, true);
  assert.equal(r.items[0].isService, false);
  assert.equal(r.total, 458);
  assert.equal(r.sheetTotal, 458);
  assert.deepEqual(r.notes, []);
  assert.ok(!JSON.stringify(r).includes('6.9') && !JSON.stringify(r).includes('62,') && !JSON.stringify(r).includes('999'), 'custo e abas internas não saem');
});

test('a coluna ESTOQUE é o prazo; a LOC é a prateleira (só do balcão); colunas de fornecedor (custo) são ignoradas', () => {
  const bytes = book([['BASE ORÇAMENTO', [
    ['LOC', 'CÓDIGO', 'DESCRIÇÃO', 'QTDE', 'VALOR UNIT', 'VALOR TOTAL', 'ESTOQUE', 'VIPECAS'],
    ['p13-a1', '587106701', 'CARBURADOR', 1, 378.26, 378.26, '10 DIAS', 200],
    ['-', '501691702', 'VELA', 1, 24, 24, 'IMEDIATO', 9.5],
  ]]]);
  const r = parseRepairSheet(bytes, 'ORÇAMENTO DAV 100.xlsx');
  assert.equal(r.status, 'OK');
  if (r.status === 'OK') {
    assert.equal(r.items[0].leadTime, '10 dias');
    assert.equal(r.items[0].partNumber, '587106701');
    assert.equal(r.items[0].location, 'P13-A1', 'a prateleira entra, em maiúscula');
    assert.equal(r.items[1].location, null, 'o traço de "sem local" vira nulo');
    assert.ok(!JSON.stringify(r).includes('200') && !JSON.stringify(r).includes('9.5'), 'o custo do fornecedor não sai');
  }
});

test('o orçamento termina no TOTAL: linhas soltas depois dele (rascunho, custo) não entram', () => {
  const bytes = book([['BASE ORÇAMENTO', [
    HEADER,
    ['A1', 'FILTRO', 1, 10, 10, 'IMEDIATO'],
    [null, null, null, 'TOTAL', 10],
    ['B2', 'LINHA DE RASCUNHO', 1, 999, 999, '7 DIAS'],
  ]]]);
  const r = parseRepairSheet(bytes, 'ORÇAMENTO DAV 200.xlsx');
  assert.equal(r.status, 'OK');
  if (r.status === 'OK') {
    assert.equal(r.items.length, 1);
    assert.equal(r.total, 10);
    assert.deepEqual(r.notes, []);
  }
});

test('quantidade fracionária (litros) vira 1 unidade com o valor certo e a descrição guarda a quantidade', () => {
  const bytes = book([['BASE ORÇAMENTO', [
    HEADER,
    [null, 'ÓLEO 20W50', 0.3, 27, 8.1, 'IMEDIATO'],
    [null, 'ÓLEO 2T', '1,5', 20, 30, 'IMEDIATO'],
    [null, 'VELA', null, 24, 24, 'IMEDIATO'],
  ]]]);
  const r = parseRepairSheet(bytes, 'ORÇAMENTO DAV 300.xlsx');
  assert.equal(r.status, 'OK');
  if (r.status !== 'OK') return;
  assert.deepEqual(r.items.map(i => [i.name, i.quantity, i.unitPrice]), [['ÓLEO 20W50 (0,3)', 1, 8.1], ['ÓLEO 2T (1,5)', 1, 30], ['VELA', 1, 24]]);
  assert.equal(r.total, 62.1);
  assert.match(r.notes.join(' '), /2 quantidades quebradas convertidas/, 'quantidade em branco (VELA) não gera aviso');
});

test('valor em branco ou em texto entra sem preço (Sob consulta) e avisa; total diferente avisa', () => {
  const bytes = book([['BASE ORÇAMENTO', [
    HEADER,
    ['A1', 'PEÇA SEM VALOR', 1, 'A COMBINAR', null, '7 DIAS'],
    ['A2', 'PEÇA', 1, '12,5', 12.5, '7 DIAS'],
    [null, null, null, 'TOTAL', 99],
  ]]]);
  const r = parseRepairSheet(bytes, 'ORÇAMENTO DAV 400.xlsx');
  assert.equal(r.status, 'OK');
  if (r.status !== 'OK') return;
  assert.equal(r.items[0].unitPrice, null);
  assert.equal(r.items[1].unitPrice, 12.5);
  assert.equal(r.total, 12.5);
  assert.match(r.notes.join(' | '), /1 linha sem valor/);
  assert.match(r.notes.join(' | '), /total escrito na planilha é diferente/);
});

test('cabeçalho com nome trocado ("XZ" no lugar de DESCRIÇÃO) e cabeçalho repetido no meio', () => {
  const bytes = book([['BASE ORÇAMENTO', [
    ['LOC', 'CÓDIGO', 'XZ', 'QTDE', 'VALOR UNIT', 'VALOR TOTAL', 'PRAZO'],
    [null, 'A1', 'KIT MANGUEIRAS', 1, 22, 22, 'IMEDIATO'],
    [null, 'CÓDIGO', 'DESCRIÇÃO', 'QTDE', 'VALOR UNIT', 'VALOR TOTAL', 'PRAZO'],
    [null, 'A2', 'VELA', 1, 10, 10, 'IMEDIATO'],
  ]]]);
  const r = parseRepairSheet(bytes, 'ORÇAMENTO DAV 500.xlsx');
  assert.equal(r.status, 'OK');
  if (r.status === 'OK') assert.deepEqual(r.items.map(i => i.name), ['KIT MANGUEIRAS', 'VELA']);
});

test('escolhe a aba BASE ORÇAMENTO mesmo que não seja a primeira, e lê .xls (formato antigo)', () => {
  const rows = [HEADER, ['A1', 'VELA', 1, 10, 10, 'IMEDIATO']];
  const r1 = parseRepairSheet(book([['PLAN1', [['x', 1]]], ['BASE ORCAMENTO', rows]]), 'ORÇAMENTO DAV 600.xlsx');
  assert.equal(r1.status, 'OK');
  const r2 = parseRepairSheet(book([['BASE ORÇAMENTO', rows]], 'biff8'), 'ORÇAMENTO DAV 601.xls');
  assert.equal(r2.status, 'OK');
});

test('arquivo temporário do Excel, nome sem número e arquivos ruins não viram orçamento nem derrubam nada', () => {
  const ok = book([['BASE ORÇAMENTO', [HEADER, ['A1', 'VELA', 1, 10, 10, 'IMEDIATO']]]]);
  assert.deepEqual(parseRepairSheet(ok, '~$ORÇAMENTO DAV 59600.xlsx'), { status: 'SKIPPED', reason: 'TEMPORARIO' });
  assert.deepEqual(parseRepairSheet(ok, 'AGRALE MICHAEL.xlsx'), { status: 'SKIPPED', reason: 'SEM_NUMERO' });
  const lixo = parseRepairSheet(Buffer.from('isto não é uma planilha'), 'ORÇAMENTO DAV 700.xlsx');
  assert.equal(lixo.status === 'OK', false);
  assert.equal(parseRepairSheet(Buffer.alloc(0), 'ORÇAMENTO DAV 701.xlsx').status === 'OK', false);
  assert.equal(parseRepairSheet(book([['BASE ORÇAMENTO', [['só', 'texto']]]]), 'ORÇAMENTO DAV 702.xlsx').status, 'PROBLEM');
  assert.deepEqual(parseRepairSheet(book([['BASE ORÇAMENTO', [HEADER]]]), 'ORÇAMENTO DAV 703.xlsx'), { status: 'PROBLEM', dav: '703', reason: 'nenhuma linha de peça' });
  assert.equal(parseRepairSheet(Buffer.alloc(700 * 1024), 'ORÇAMENTO DAV 704.xlsx').status, 'PROBLEM');
});

test('orçamento com linhas demais é recusado, e a leitura é limitada (planilha enorme não trava)', () => {
  const rows: unknown[][] = [HEADER];
  for (let i = 0; i < 300; i += 1) rows.push([`C${i}`, `PEÇA ${i}`, 1, 1, 1, 'IMEDIATO']);
  const r = parseRepairSheet(book([['BASE ORÇAMENTO', rows]]), 'ORÇAMENTO DAV 800.xlsx');
  assert.equal(r.status, 'PROBLEM');
});
