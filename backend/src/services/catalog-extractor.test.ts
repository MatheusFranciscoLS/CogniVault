import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHusqvarnaIplText } from './catalog-extractor';

test('extrai linhas de peças do formato textual IPL da Husqvarna', () => {
    const rows = Array.from({ length: 10 }, (_, index) => (
        `${index + 1} \t505 30 ${String(index).padStart(2, '0')}-01 \tPeça ${index + 1} \tA \t1`
    )).join('\n');
    const text = `
SERVICE
IPL, 143 R II, 2008-06, 510 25 02-01

-- 1 of 3 --

Gear

-- 2 of 3 --

Pos. Nr. \tPart nr. \tName \tPage \tQty (on this page) \tIncl. in kit
${rows}
Gear

-- 3 of 3 --
`;

    const extraction = parseHusqvarnaIplText(text);
    assert.ok(extraction);
    assert.equal(extraction.manufacturer, 'Husqvarna');
    assert.deepEqual(extraction.models, ['143RII']);
    assert.equal(extraction.parts.length, 10);
    assert.equal(extraction.parts[0].partNumber, '505 30 00-01');
    assert.equal(extraction.parts[0].page, 3);
    assert.equal(extraction.parts[0].section, 'Gear');
    assert.equal(extraction.parts[0].universalAcrossPnc, true);
});

test('não classifica tabelas pequenas ou PDFs sem assinatura IPL como catálogo completo', () => {
    assert.equal(parseHusqvarnaIplText('PDF comum sem tabela'), null);
    assert.equal(parseHusqvarnaIplText(`
      IPL, 143 R II, 2008-06
      Pos. Nr. Part nr. Qty (on this page)
      1 \t505 30 00-01 \tPeça \tA \t1
      -- 1 of 1 --
    `), null);
});
