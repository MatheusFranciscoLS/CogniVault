import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHusqvarnaIplText } from './catalog-extractor';

test('modelo explícito no IPL vence hint antigo incorreto', () => {
  const rows = Array.from({ length: 10 }, (_, index) => `${index + 1} 58982${String(index).padStart(4, '0')} PEÇA ${index + 1} 1`).join('\n');
  const text = `
03/04/2025, 14:42 Roçadeira Husqvarna 321R Husqvarna | Husqvarna Portal BR
321 R BRUSHCUTTER
https://portal.husqvarnagroup.com/br/rocadeiras/rocadeira-husqvarna-321r/?printipl=true 1/2
Referência Número do artigo Nome do artigo Quantidade Comentário
${rows}
https://portal.husqvarnagroup.com/br/rocadeiras/rocadeira-husqvarna-321r/?printipl=true 2/2
`;

  const extraction = parseHusqvarnaIplText(text, {
    manufacturer: 'Husqvarna',
    model: 'assy 321S',
    filename: 'Roçadeira Husqvarna 321R.pdf',
  });

  assert.ok(extraction);
  assert.deepEqual(extraction.models, ['321R']);
  assert.ok(extraction.parts.every(part => part.model === '321R'));
});

test('hint continua sendo fallback quando o PDF não informa modelo', () => {
  const rows = Array.from({ length: 10 }, (_, index) => `${index + 1} 58983${String(index).padStart(4, '0')} PEÇA ${index + 1} 1`).join('\n');
  const text = `
HUSQVARNA PORTAL
Referência Número do artigo Nome do artigo Quantidade Comentário
${rows}
`;
  const extraction = parseHusqvarnaIplText(text, { model: 'MODELO MANUAL', manufacturer: 'Husqvarna' });
  assert.ok(extraction);
  assert.deepEqual(extraction.models, ['MODELO MANUAL']);
});
