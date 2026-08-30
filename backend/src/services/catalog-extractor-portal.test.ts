import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHusqvarnaIplText } from './catalog-extractor';

function table(rows: string[]) {
  return rows.join('\n');
}

test('prioriza identidade do catálogo do Portal sobre comentários internos de outra aplicação', () => {
  const rows = Array.from({ length: 10 }, (_, index) => `${index + 1} ${590211101 + index} PEÇA ${index + 1} assy 321S sprayer 1`);
  const text = `
03/04/2025, 14:42 Roçadeira Roçadeira Husqvarna 321R Husqvarna | Husqvarna Portal BR
https://portal.husqvarnagroup.com/br/rocadeiras/rocadeira-husqvarna-321r/?printipl=true&iplId=HVA_PL-000030899 1/3
321 C, R, RJ
STARTER
03/04/2025, 14:42 Roçadeira Roçadeira Husqvarna 321R Husqvarna | Husqvarna Portal BR
https://portal.husqvarnagroup.com/br/rocadeiras/rocadeira-husqvarna-321r/?printipl=true&iplId=HVA_PL-000030899 2/3
${table(rows)}
Referência Número do artigo Nome do artigo Quantidade Comentário
03/04/2025, 14:42 Roçadeira Roçadeira Husqvarna 321R Husqvarna | Husqvarna Portal BR
https://portal.husqvarnagroup.com/br/rocadeiras/rocadeira-husqvarna-321r/?printipl=true&iplId=HVA_PL-000030899 3/3
`;

  const extraction = parseHusqvarnaIplText(text, { filename: 'Roçadeira Husqvarna 321R.pdf' });
  assert.ok(extraction);
  assert.deepEqual(extraction.models, ['321R']);
  assert.equal(extraction.parts.length, 10);
});

test('associa a tabela do Portal à vista técnica da página imediatamente anterior', () => {
  const rows = Array.from({ length: 10 }, (_, index) => `${index + 1} ${538933901 + index} COMPONENTE ${index + 1} 1`);
  const text = `
03/04/2025, 14:42 Roçadeira Roçadeira Husqvarna 321R Husqvarna | Husqvarna Portal BR
321 C, R, RJ
CRANKCASE & CLUTCHDRUM
https://portal.husqvarnagroup.com/br/rocadeiras/rocadeira-husqvarna-321r/?printipl=true&iplId=HVA_PL-000030899 16/17
${table(rows)}
Referência Número do artigo Nome do artigo Quantidade Comentário
03/04/2025, 14:42 Roçadeira Roçadeira Husqvarna 321R Husqvarna | Husqvarna Portal BR
https://portal.husqvarnagroup.com/br/rocadeiras/rocadeira-husqvarna-321r/?printipl=true&iplId=HVA_PL-000030899 17/17
`;

  const extraction = parseHusqvarnaIplText(text, { filename: 'Roçadeira Husqvarna 321R.pdf' });
  assert.ok(extraction);
  assert.ok(extraction.parts.every(part => part.section === 'CRANKCASE & CLUTCHDRUM'));
});
