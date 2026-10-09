import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseKohlerCsv } from './kohler-csv';

// CSV INVENTADO no desenho do export real (CRLF, ponto e vírgula, sumário antes dos grupos, aspas com ""). Códigos e nomes não são de nenhum motor.
const CRLF = '\r\n';
const CSV = [
  'Spare parts catalog : ZZ100-0001', '', 'Last update 06/10/2026', 'Print date 09/10/2026', '', '',
  'Code;Description', '01;Eixo Teste', '02;Bloco Teste', '', '', '',
  '01 - Eixo Teste', '',
  'Pos;Kit;Included in;Part #;Description;Note;QTY;Tech info',
  '1;;;00 000 01-S;EIXO COMPLETO;;1;',
  '2;;;00 000 02-S;"CHAVETA, 3/16"" X 5/8""";;1;',
  '3;;;00 000 03-S;ARRUELA-DISCONTINUED;ver nota;2;!',
  '', '',
  '02 - Bloco Teste', '',
  'Pos;Kit;Included in;Part #;Description;Note;QTY;Tech info',
  '1;K1;;00 000 04-S;PARAFUSO (#DSC);;4;',
  '5;;K1;;SEM CÓDIGO;;1;',
  '',
].join(CRLF);

describe('CSV do catálogo Kohler', () => {
  it('lê o spec, a data e os grupos na ordem, ignorando o sumário do começo', () => {
    const catalog = parseKohlerCsv(CSV)!;
    assert.equal(catalog.spec, 'ZZ100-0001');
    assert.equal(catalog.lastUpdate, '06/10/2026');
    assert.deepEqual(catalog.groups.map(group => [group.code, group.name, group.parts.length]), [['01', 'Eixo Teste', 3], ['02', 'Bloco Teste', 1]]);
  });

  it('lê os campos da peça, inclusive aspas com "" e a marca de Tech info', () => {
    const [first, second, third] = parseKohlerCsv(CSV)!.groups[0].parts;
    assert.deepEqual([first.position, first.partNumber, first.name, first.quantity, first.techInfo], ['1', '00 000 01-S', 'EIXO COMPLETO', 1, false]);
    assert.equal(second.name, 'CHAVETA, 3/16" X 5/8"');
    assert.deepEqual([third.note, third.quantity, third.techInfo], ['ver nota', 2, true]);
  });

  it('peça fora de linha é reconhecida pelas duas marcas que a Kohler usa na descrição', () => {
    const catalog = parseKohlerCsv(CSV)!;
    assert.equal(catalog.groups[0].parts[2].discontinued, true);
    assert.equal(catalog.groups[1].parts[0].discontinued, true);
    assert.equal(catalog.groups[0].parts[0].discontinued, false);
  });

  it('kit e "incluída em" vêm quando existem; linha sem código é descartada', () => {
    const group = parseKohlerCsv(CSV)!.groups[1];
    assert.equal(group.parts.length, 1);
    assert.equal(group.parts[0].kit, 'K1');
  });

  it('o que não é o export de um motor devolve nulo, sem lançar', () => {
    for (const text of ['', null, undefined, '<html>página de verificação</html>', 'Spare parts catalog : ZZ100-0001\r\n\r\nsem grupos']) {
      assert.equal(parseKohlerCsv(text as string), null, String(text).slice(0, 20));
    }
  });

  it('aceita fim de linha só com LF e espaço sobrando', () => {
    const catalog = parseKohlerCsv(CSV.split(CRLF).join('\n'))!;
    assert.equal(catalog.groups[0].parts.length, 3);
  });
});
