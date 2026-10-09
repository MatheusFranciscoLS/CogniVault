import { describe, expect, it } from 'vitest';
import { PriceListFileError, extractPriceListPayload } from './price-list-file';

// Arquivo INVENTADO com a forma do real: um bloco catalogData com imagem em base64 de enfeite e as quatro listas.
const page = (catalog: unknown) => `<!DOCTYPE html><html><body><script id="catalogData" type="application/json">${JSON.stringify(catalog)}</script></body></html>`;
const empty = { pecas: [], acessorios: [], lubrificantes: [], ferramentas: [] };

describe('extractPriceListPayload', () => {
  it('fica só com as quatro listas e com os campos que o servidor usa', () => {
    const payload = extractPriceListPayload(page({
      ...empty,
      produtos: [{ codigo: 'MAQ1', imagem: 'data:image/png;base64,AAAA' }],
      pecas: [{ codigo: 'ZQ1', descricao: 'PEÇA', preco: 'R$ 10,00', modelo: 'M1', imagem: 'data:image/png;base64,BBBB', observacao: 'x' }],
    }));
    expect(Object.keys(payload).sort()).toEqual(['acessorios', 'ferramentas', 'lubrificantes', 'pecas', 'revisao']);
    expect(payload.pecas).toEqual([{ codigo: 'ZQ1', descricao: 'PEÇA', preco: 'R$ 10,00', modelo: 'M1' }]);
  });

  it('valor que não é texto é descartado e linha estranha vira linha vazia (o servidor conta como "sem código")', () => {
    const payload = extractPriceListPayload(page({ ...empty, pecas: [{ codigo: 123, preco: null, ean: 'E1' }, null, 'texto'] }));
    expect(payload.pecas).toEqual([{ ean: 'E1' }, {}, {}]);
  });

  it('separa as peças de revisão (preventivo, consumível, preditivo) com o PNC; corretivo e vazio ficam de fora', () => {
    const row = (codigo: string, pnc: string, reparo: string) => ({ codigo, pnc, reparo, descricao: 'PEÇA ' + codigo, preco: 'R$ 1,00', imagem: 'x' });
    const payload = extractPriceListPayload(page({ ...empty, pecas: [
      row('A1', '967000001', 'PREVENTIVO'), row('A2', '967000001', 'CONSUMÍVEL'), row('A3', '967000001', 'preditivo'),
      row('A4', '967000001', 'CORRETIVO'), row('A5', '967000001', ''), row('A6', '967000001', 'ACESSÓRIO'),
    ] }));
    expect(payload.revisao.map(item => item.codigo)).toEqual(['A1', 'A2', 'A3']);
    expect(payload.revisao[0]).toEqual({ codigo: 'A1', pnc: '967000001', reparo: 'PREVENTIVO', descricao: 'PEÇA A1' });
    expect(payload.pecas).toHaveLength(6);
  });

  it('lista sem o campo reparo (antiga) manda revisão vazia, sem erro', () => {
    expect(extractPriceListPayload(page({ ...empty, pecas: [{ codigo: 'A1', preco: 'R$ 1,00' }] })).revisao).toEqual([]);
  });

  it('arquivo que não é a lista explica o que houve, sem lançar erro estranho', () => {
    const cases: Array<[string, RegExp]> = [
      ['<html><body>olá</body></html>', /não parece ser o arquivo/],
      ['<script id="catalogData" type="application/json">{"pecas": [', /incompleto/],
      ['<script id="catalogData" type="application/json">{quebrado}</script>', /corrompido/],
      ['<script id="catalogData" type="application/json">[1,2]</script>', /formato/],
      [page({ pecas: [], acessorios: [], lubrificantes: [] }), /"ferramentas" não está/],
      ['', /não parece ser o arquivo/],
    ];
    for (const [html, message] of cases) {
      expect(() => extractPriceListPayload(html), html.slice(0, 40)).toThrow(PriceListFileError);
      expect(() => extractPriceListPayload(html)).toThrow(message);
    }
  });

  it('aguenta uma lista grande sem travar (30 mil linhas)', () => {
    const pecas = Array.from({ length: 30_000 }, (_, index) => ({ codigo: `ZQ${index}`, descricao: `PEÇA ${index}`, preco: 'R$ 1,00', modelo: 'M' }));
    const started = performance.now();
    expect(extractPriceListPayload(page({ ...empty, pecas })).pecas).toHaveLength(30_000);
    expect(performance.now() - started).toBeLessThan(3_000);
  });
});
