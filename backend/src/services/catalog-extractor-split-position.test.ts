import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHusqvarnaIplText } from './catalog-extractor';

test('preserva posições quando o Portal quebra posição e Part Number em linhas diferentes', () => {
  const text = `
03/04/2025, 14:42 Roçadeira Husqvarna 321R Husqvarna | Husqvarna Portal BR
321 R BRUSHCUTTER
https://portal.husqvarnagroup.com/br/rocadeiras/rocadeira-husqvarna-321r/?printipl=true 1/3
03/04/2025, 14:42 Roçadeira Husqvarna 321R Husqvarna | Husqvarna Portal BR
https://portal.husqvarnagroup.com/br/rocadeiras/rocadeira-husqvarna-321r/?printipl=true 2/3
Referência Número do artigo Nome do artigo Quantidade Comentário
1 531147357 CRANKCASE KIT 1
2 531147387 VEDAÇÃO 1
3 503251701 ROLAMENTO DE ESFERAS 6001 C3 1
4 589536501 JUNTA Gasket crankcase side 1
5 589539401 PONTE Bridge sprayer 1
6 531147364 VOLANTE 1
7 538936801 PORCA GB/T 41 M8 1
8
589823301 ARRUELA DE PRESSÃO 1
9 538946401 BOBINA DE IGNIÇÃO Coil Assy 1
10 589877401 SCREW IHSCM M5x16 8.8 1
11 531147356 CONJ DE EMBRAIAGEM 1
12 589539601 EMBRAIAGEM Clutch 52 1
13 538934101 ANILHA FLAT 8 X 16 X 1 1
https://portal.husqvarnagroup.com/br/rocadeiras/rocadeira-husqvarna-321r/?printipl=true 3/3
`;

  const extraction = parseHusqvarnaIplText(text, {
    manufacturer: 'Husqvarna',
    model: '321R',
    filename: 'Roçadeira Husqvarna 321R.pdf',
  });

  assert.ok(extraction);
  assert.equal(extraction.parts.length, 13);
  const split = extraction.parts.find(part => part.position === '8');
  assert.ok(split);
  assert.equal(split.partNumber, '589823301');
  assert.match(split.name, /ARRUELA DE PRESSÃO/i);
});
