import { describe, expect, it } from 'vitest';
import { bytesToBase64, chunk, davFromName, selectImportable, summarizeEntries, type ImportEntry } from './repair-import';

const arquivo = (name: string, lastModified = 1000, size = 11_000) => ({ name, lastModified, size });

describe('importação dos orçamentos de conserto antigos: o que vai ao servidor', () => {
  it('o número da OS vem do nome, como a loja escreve', () => {
    expect(davFromName('ORÇAMENTO DAV 59600.xlsx')).toBe('59600');
    expect(davFromName('pasta/sub/ORCAMENTO_DAV_00123 (1).xls')).toBe('123');
    expect(davFromName('AGRALE MICHAEL.xlsx')).toBeNull();
  });

  it('separa o que vai do que fica de fora e diz o porquê', () => {
    const escolha = selectImportable([
      arquivo('ORÇAMENTO DAV 59600.xlsx'),
      arquivo('ORÇAMENTO DAV 18563.xls'),
      arquivo('~$ORÇAMENTO DAV 59601.xlsx'),
      arquivo('AGRALE MICHAEL.xlsx'),
      arquivo('ARQUIVO BASE EXCEL.xlsx'),
      arquivo('ORÇAMENTO DAV 59602.pdf'),
      arquivo('Thumbs.db'),
      arquivo('proposta.docx'),
    ]);
    expect(escolha.send.map(f => f.name)).toEqual(['ORÇAMENTO DAV 18563.xls', 'ORÇAMENTO DAV 59600.xlsx']);
    expect(escolha).toMatchObject({ temporary: 1, noNumber: 2, notSpreadsheet: 3, repeated: 0 });
  });

  it('OS repetida: vale a mais nova (e, empatando, a maior)', () => {
    const escolha = selectImportable([
      arquivo('ORÇAMENTO DAV 17337.xlsx', 1000, 11_000),
      arquivo('Orçamento Máquinas/ORÇAMENTO DAV 17337.xlsx', 3000, 12_000),
      arquivo('ORÇAMENTO DAV 17337 (1).xlsx', 2000, 20_000),
      arquivo('ORÇAMENTO DAV 17338.xlsx', 500, 10_000),
      arquivo('ORÇAMENTO DAV 17338.xls', 500, 22_000),
    ]);
    expect(escolha.send).toHaveLength(2);
    expect(escolha.send[0].lastModified).toBe(3000);
    expect(escolha.send[1].size).toBe(22_000);
    expect(escolha.repeated).toBe(3);
  });

  it('pasta vazia ou sem planilha não manda nada', () => {
    expect(selectImportable([]).send).toEqual([]);
    expect(selectImportable([arquivo('foto.jpg')]).send).toEqual([]);
  });

  it('lotes e base64', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 25)).toEqual([]);
    expect(bytesToBase64(new TextEncoder().encode('PK\u0003\u0004'))).toBe(btoa('PK\u0003\u0004'));
    // arquivo grande não estoura a pilha
    const grande = new Uint8Array(300_000).fill(65);
    expect(atob(bytesToBase64(grande)).length).toBe(300_000);
  });
});

describe('relatório de todos os lotes', () => {
  const entradas: ImportEntry[] = [
    { name: 'a', status: 'OK', dav: '1', notes: ['2 linhas sem valor', 'o total escrito na planilha é diferente da soma das linhas'] },
    { name: 'b', status: 'OK', dav: '2', notes: ['1 linha sem valor', '2 quantidades quebradas convertidas (ex.: litros)'] },
    { name: 'c', status: 'OK', dav: '3' },
    { name: 'd', status: 'EXISTS', dav: '4', reason: 'a OS já está na pasta' },
    { name: 'e', status: 'SKIPPED', reason: 'arquivo temporário do Excel' },
    { name: 'f', status: 'PROBLEM', reason: 'cabeçalho não encontrado' },
  ];

  it('conta cada situação e junta os avisos do mesmo tipo', () => {
    const totais = summarizeEntries(entradas);
    expect(totais).toMatchObject({ ok: 3, exists: 1, skipped: 1, problems: 1 });
    expect(totais.warnings).toEqual([
      { label: 'com linha sem valor', count: 2 },
      { label: 'com o total diferente da soma das linhas', count: 1 },
      { label: 'com quantidade quebrada (litros) convertida', count: 1 },
    ]);
    expect(totais.problemList).toEqual([{ name: 'f', reason: 'cabeçalho não encontrado' }]);
  });

  it('sem entrada, tudo zerado', () => {
    expect(summarizeEntries([])).toEqual({ ok: 0, exists: 0, skipped: 0, problems: 0, warnings: [], problemList: [] });
  });
});
