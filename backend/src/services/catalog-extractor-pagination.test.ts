import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHusqvarnaIplText } from './catalog-extractor';

test('Portal com rodapé colado à data seguinte preserva página e usa filename só como último fallback de modelo', () => {
  const rows = Array.from({ length: 10 }, (_, index) => (
    `${index + 1} ${598684111 + index} PEÇA TESTE ${index + 1} 1`
  )).join('\n');

  const text = `
Husqvarna Portal BR
03/04/2025, 14:59 catálogo de peças
https://portal.husqvarnagroup.com/br/teste/?printipl=true&iplId=HVA_PL-TEST 1/3
03/04/2025, 14:59 segunda página
https://portal.husqvarnagroup.com/br/teste/?printipl=true&iplId=HVA_PL-TEST 2/303/04/2025, 15:00 terceira página
Referência Número do artigo Nome do artigo Quantidade Comentário
${rows}
https://portal.husqvarnagroup.com/br/teste/?printipl=true&iplId=HVA_PL-TEST 3/3
`;

  const extraction = parseHusqvarnaIplText(text, {
    filename: 'Cortador de grama Husqvarna LB 256SP.pdf',
  });

  assert.ok(extraction);
  assert.deepEqual(extraction.models, ['LB 256SP']);
  assert.equal(extraction.parts.length, 10);
  assert.ok(extraction.parts.every(part => part.page === 3));
  assert.equal(extraction.parts[0].partNumber, '598684111');
});
