import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MIN_CATALOG_OCCURRENCES,
  analyzeHusqvarnaIplText,
  describeDecline,
  parseHusqvarnaIplText,
} from './catalog-extractor';

/**
 * A leitura textual recusar um PDF é decisão de projeto, e os testes existentes
 * já travam essas recusas. O que estes testes travam é o **motivo** reportado:
 * é ele que diz, no painel, se vale estender o parser (grátis e exato) ou se o
 * catálogo é mesmo caso de leitura visual com IA.
 */

function iplRows(count: number): string {
  return Array.from({ length: count }, (_, index) =>
    `${index + 1} \t505 30 ${String(index).padStart(2, '0')}-01 \tPeça ${index + 1} \tA \t1`,
  ).join('\n');
}

function iplText(rows: string, header = 'IPL, 143 R II, 2008-06, 510 25 02-01'): string {
  return `
SERVICE
${header}

-- 1 of 2 --

Pos. Nr. \tPart nr. \tName \tPage \tQty (on this page)
${rows}
Gear

-- 2 of 2 --
`;
}

test('PDF sem assinatura de lista de peças recusa como NO_SIGNATURE', () => {
  const result = analyzeHusqvarnaIplText('Contrato de garantia. Nenhuma tabela de peças aqui.');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.decline.reason, 'NO_SIGNATURE');
  assert.ok(result.decline.detail.textLength && result.decline.detail.textLength > 0);
});

test('IPL sem modelo no texto nem no nome do arquivo recusa como NO_MODEL', () => {
  // Assinatura presente (SPARE PARTS LIST), mas nada que revele o modelo.
  const text = `
SPARE PARTS LIST
-- 1 of 1 --
Pos. Nr. \tPart nr. \tName \tPage \tQty (on this page)
${iplRows(MIN_CATALOG_OCCURRENCES)}
`;
  const result = analyzeHusqvarnaIplText(text, { filename: 'documento-sem-pistas.pdf' });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.decline.reason, 'NO_MODEL');
});

test('IPL com modelo mas sem linha de peça legível recusa como NO_ROWS', () => {
  const text = `
IPL, 143 R II, 2008-06
-- 1 of 1 --
Somente texto corrido, sem nenhuma linha de tabela reconhecível.
`;
  const result = analyzeHusqvarnaIplText(text);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.decline.reason, 'NO_ROWS');
  assert.equal(result.decline.detail.model, '143RII');
});

test('tabela abaixo do piso recusa como TOO_FEW_OCCURRENCES e informa quantas leu', () => {
  const result = analyzeHusqvarnaIplText(iplText(iplRows(MIN_CATALOG_OCCURRENCES - 1)));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.decline.reason, 'TOO_FEW_OCCURRENCES');
  assert.equal(result.decline.detail.occurrences, MIN_CATALOG_OCCURRENCES - 1);
  assert.equal(result.decline.detail.model, '143RII');
});

test('exatamente no piso a tabela é aceita', () => {
  const result = analyzeHusqvarnaIplText(iplText(iplRows(MIN_CATALOG_OCCURRENCES)));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.method, 'HUSQVARNA_IPL_TEXT');
  assert.equal(result.extraction.models[0], '143RII');
});

test('a porta de entrada simples continua devolvendo extração ou null', () => {
  // Compatibilidade: os outros testes do extrator dependem desta assinatura.
  assert.equal(parseHusqvarnaIplText('PDF comum sem tabela'), null);
  const extraction = parseHusqvarnaIplText(iplText(iplRows(MIN_CATALOG_OCCURRENCES)));
  assert.ok(extraction);
  assert.equal(extraction.parts.length, MIN_CATALOG_OCCURRENCES);
});

test('cada motivo vira uma frase que o dono consegue agir em cima', () => {
  const frases = [
    describeDecline({ reason: 'NO_TEXT_LAYER', detail: { textLength: 0 } }),
    describeDecline({ reason: 'NO_SIGNATURE', detail: { textLength: 1200 } }),
    describeDecline({ reason: 'NO_MODEL', detail: {} }),
    describeDecline({ reason: 'NO_ROWS', detail: { model: '143RII', pages: 4 } }),
    describeDecline({ reason: 'TOO_FEW_OCCURRENCES', detail: { occurrences: 3 } }),
  ];

  for (const frase of frases) {
    assert.ok(frase.length > 20, `frase curta demais: ${frase}`);
    assert.ok(!/undefined|NaN|\[object/.test(frase), `frase com buraco: ${frase}`);
  }

  assert.match(frases[0], /digitalizado/i);
  assert.match(frases[3], /143RII/);
  assert.match(frases[4], /3 peça/);
});
