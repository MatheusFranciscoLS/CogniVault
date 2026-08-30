import assert from 'node:assert/strict';
import test from 'node:test';
import { looksLikeDescriptionModel, looksLikePartRowModel, parseHusqvarnaIplText } from './catalog-extractor';

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

test('aceita tabela Husqvarna extraída com espaços no lugar de tabulações', () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
        `${index + 1}  505 30 ${String(index + 10).padStart(2, '0')}-01  Peça ${index + 1}  L  1`,
    ).join('\n');
    const text = `
IPL, 143 R II, 2008-06
-- 1 of 2 --
Position Part No. Description Page Qty
${rows}
Intake
-- 2 of 2 --
`;

    const extraction = parseHusqvarnaIplText(text, { manufacturer: 'Husqvarna' });
    assert.ok(extraction);
    assert.equal(extraction.parts.length, 10);
    assert.equal(extraction.parts[0].partNumber, '505 30 10-01');
    assert.equal(extraction.parts[0].section, 'Intake');
});

test('extrai tabela do Portal BR com código contínuo, linhas quebradas e aplicação por PNC', () => {
    const text = `
03/04/2025
LC 151 LAWN MOWER LatAm
03/04/2025, 14:57 Cortador de grama Husqvarna LC 151 Husqvarna | Husqvarna Portal BR
https://portal.husqvarnagroup.com/br/cortadores/lc151/?printipl=true 1/3
03/04/2025, 14:57 Cortador de grama Husqvarna LC 151 Husqvarna | Husqvarna Portal BR
https://portal.husqvarnagroup.com/br/cortadores/lc151/?printipl=true 2/3
1 598684111
PLATE KIT SIDE DISCHARGE
PLATE KIT
1 SIDE DISCHARGE PLATE
2 598818701 EIXO WHEEL AXLE FRONT 1
For 970488301. WHEEL AXLE.
3 529595301 EIXO WHEEL AXLE 1
For 970488302. WHEEL AXLE.
4 598512901 RODA FRONT WHEEL KIT 1 FRONT WHEEL
5 598721701 SELO DE SUJIDADE DUST-PROOF RING 1
For all EXCEPT 970488301. DUST-PROOF RING.
6 598513301 EIXO REAR SHAFT KIT 1 REAR SHAFT
7 598684109 EIXO WHEEL AXLE KIT 1 WHEEL AXLE
8 598684103 RODA REAR WHEEL KIT 1 REAR WHEEL
9 599138801 BIELA HEIGHT ADJUSTMENT ROD 1 HEIGHT ADJUSTMENT ROD
10 599138901 MOLA HEIGHT ADJUSTMENT SPRING 1 HEIGHT ADJUSTMENT SPRING
Referê
ncia
Número do
artigo
Nome do artigo Quanti
dade
Comentário
03/04/2025, 14:57 Cortador de grama Husqvarna LC 151 Husqvarna | Husqvarna Portal BR
https://portal.husqvarnagroup.com/br/cortadores/lc151/?printipl=true 3/3
`;

    const extraction = parseHusqvarnaIplText(text);
    assert.ok(extraction);
    assert.deepEqual(extraction.models, ['LC 151']);
    assert.deepEqual(extraction.pncs.sort(), ['970488301', '970488302']);
    assert.equal(extraction.parts.length, 10);

    const common = extraction.parts.find(part => part.position === '1');
    const pnc301 = extraction.parts.find(part => part.position === '2' && part.pnc === '970488301');
    const pnc302 = extraction.parts.find(part => part.position === '3' && part.pnc === '970488302');
    const except301 = extraction.parts.filter(part => part.position === '5');
    assert.equal(common?.pnc, '');
    assert.equal(common?.universalAcrossPnc, true);
    assert.equal(pnc301?.partNumber, '598818701');
    assert.equal(pnc302?.partNumber, '529595301');
    assert.deepEqual(except301.map(part => part.pnc), ['970488302']);
    assert.equal(pnc301?.page, 3);
});

test('extrai tabela inglesa KEY/PART com MFG ID sem exigir quantidade', () => {
    const text = `
ILLUSTRATED PARTS LIST
BRAND: HUSQVARNA
ROTARY LAWN MOWER
MODEL NUMBER: HU725AWD
MFG. ID. NUMBER: 96145001703
KEY PART
NO. NO. DESCRIPTION
1 585 85 48-06 Upper Handle Assembly
2 532 42 49-83 Cable, Engine Zone Control
17 581 78 21-01 Rear Baffle
20 532 44 45-01 Rear Skirt
21 532 41 99-49 Spring, Rear Door, LH, Black
24 532 41 99-48 Spring, Rear Door, RH, Grey
38 532 42 61-29 Discharge Deflector
46 581 65 09-01 Blade Adapter
47 587 19 96-01 Blade, 22"
50 532 17 96-17 Bolt, Hex Head, Grade 8
3/8-24 x 1-3/8
`;

    const extraction = parseHusqvarnaIplText(text);
    assert.ok(extraction);
    assert.deepEqual(extraction.models, ['HU725AWD']);
    assert.deepEqual(extraction.pncs, ['96145001703']);
    assert.equal(extraction.parts.length, 10);
    assert.equal(extraction.parts.find(part => part.position === '21')?.partNumber, '532 41 99-49');
    assert.match(extraction.parts.find(part => part.position === '21')?.name || '', /LH/i);
    assert.match(extraction.parts.find(part => part.position === '50')?.name || '', /3\/8-24/);
});

test('preserva For e For all EXCEPT quando a aplicação está colada ao nome, como no LB155S', () => {
    const text = `
ILLUSTRATED PARTS LIST
BRAND: HUSQVARNA
ROTARY LAWN MOWER
MODEL NUMBER: LB 155S
MFG. ID. NUMBER: 96121003700
KEY PART
NO. NO. DESCRIPTION
28 586212501 PARAFUSO BOLT CARRIAGE 5/16-18 1 For 96121002700
28 872250505 PARAFUSO CARRIAGE 5/16-18 X 5/8 1 For all EXCEPT 96121002700
29 532000001 ARRUELA 1 For 96121003700
30 532000002 PORCA
31 532000003 SUPORTE
32 532000004 MOLA
33 532000005 PORTA
34 532000006 CABO
35 532000007 RODA
36 532000008 EIXO
`;

    const extraction = parseHusqvarnaIplText(text);
    assert.ok(extraction);
    assert.deepEqual(extraction.pncs.sort(), ['96121002700', '96121003700']);

    const specific = extraction.parts.filter(part => part.partNumber === '586212501');
    const except = extraction.parts.filter(part => part.partNumber === '872250505');
    const common = extraction.parts.find(part => part.partNumber === '532000002');
    assert.deepEqual(specific.map(part => part.pnc), ['96121002700']);
    assert.deepEqual(except.map(part => part.pnc), ['96121003700']);
    assert.equal(common?.universalAcrossPnc, true);
    assert.equal(common?.pnc, '');
    assert.ok(specific.every(part => !/\bFor\b/i.test(part.name)));
    assert.ok(except.every(part => !/\bFor\b/i.test(part.name)));
    assert.match(specific[0]?.notes || '', /For 96121002700/i);
    assert.match(except[0]?.notes || '', /For all EXCEPT 96121002700/i);
});

test('rejeita uma linha de peça usada indevidamente como hint de modelo', () => {
    assert.equal(looksLikePartRowModel('1 \t586047302\nDECALQUE'), true);
    assert.equal(looksLikePartRowModel('6 535482401 POLIA'), true);
    assert.equal(looksLikePartRowModel('TS 254G'), false);

    const rows = Array.from({ length: 10 }, (_, index) => `${index + 1} 53200${String(index).padStart(4, '0')} PEÇA ${index + 1} 1`).join('\n');
    const text = `
03/04/2025
TS 148
Trator de jardim Trator cortador de grama Husqvarna TS 148 Husqvarna | Husqvarna Portal BR
https://portal.husqvarnagroup.com/br/tratores-de-jardim/trator-cortador-de-grama-husqvarna-ts148/?printipl=true 1/2
${rows}
Referência Número do artigo Nome do artigo Quantidade Comentário
https://portal.husqvarnagroup.com/br/tratores-de-jardim/trator-cortador-de-grama-husqvarna-ts148/?printipl=true 2/2
`;
    const extraction = parseHusqvarnaIplText(text, {
        model: '1 \t586047302\nDECALQUE',
        filename: 'Trator cortador de grama Husqvarna TS 148.pdf',
    });
    assert.ok(extraction);
    assert.deepEqual(extraction.models, ['TS 148']);
});

test('321R não aceita descrição compartilhada assy 321S como modelo do catálogo', () => {
    assert.equal(looksLikeDescriptionModel('assy 321S'), true);
    assert.equal(looksLikeDescriptionModel('Clutch Assy 321S sprayer'), true);
    assert.equal(looksLikeDescriptionModel('321R'), false);

    const text = `
03/04/2025, 14:42 Roçadeira Roçadeira Husqvarna 321R Husqvarna | Husqvarna Portal BR
1 531147359 CONJ DO CILINDRO 1
2 589877401 SCREW SCREW IHSCM M5x16 8.8 1
3 589535801 JUNTA Gasket Cylinder gasket 1
4 590210901 CONJ. DO PISTÃO kit 321S sprayer 1
5 589537001 ANEL DO PISTÃO Piston ring 1
6 737440800 ANEL DE RETENÇÃO 1
7 531147358 CONJ DA VIRABREQUIM 1
8 531147379 TECLA 1
9 590710101 VELA DE IGNIÇÃO HQT-2 1
10 538929201 PLACA Plate 1
Referência Número do artigo Nome do artigo Quantidade Comentário
https://portal.husqvarnagroup.com/br/rocadeiras/rocadeira-husqvarna-321r/?printipl=true&iplId=HVA_PL-000030899 3/21
`;

    const extraction = parseHusqvarnaIplText(text, {
        model: 'assy 321S',
        filename: 'Roçadeira Husqvarna 321R.pdf',
    });
    assert.ok(extraction);
    assert.deepEqual(extraction.models, ['321R']);
    assert.equal(extraction.parts.length, 10);
    assert.ok(extraction.parts.every(part => part.model === '321R'));
    assert.ok(extraction.parts.every(part => part.section === 'CYLINDER PISTON'));
});
