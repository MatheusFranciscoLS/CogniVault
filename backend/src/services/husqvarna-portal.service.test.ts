import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeHusqvarnaPartNumber, parseHusqvarnaPortalHtml } from './husqvarna-portal.service';

test('aceita somente códigos Husqvarna numéricos de 8 a 12 dígitos', () => {
  assert.equal(normalizeHusqvarnaPartNumber('587 10 67-01'), '587106701');
  assert.equal(normalizeHusqvarnaPartNumber('143RII'), '');
  assert.equal(normalizeHusqvarnaPartNumber('1234567'), '');
});

test('lê peça atual e histórico da página pública Husqvarna', () => {
  const html = `
    <html><body>
      <h1>EMBRAIAGEM</h1>
      <strong>CLUTCH ASSY</strong>
      <div>Número do artigo: 599 76 47-01</div>
      <h2>Histórico de substituição</h2>
      <p>Esta peça é a mais recente na cadeia de substituições.</p>
      <a>505 29 76-01</a>
      <a>515 36 56-01</a>
      <a>521 32 55-01</a>
      <h2>Especificações</h2>
    </body></html>
  `;

  const lookup = parseHusqvarnaPortalHtml(html, '599764701');
  assert.equal(lookup.status, 'VERIFIED');
  assert.equal(lookup.currentPartNumber, '599764701');
  assert.equal(lookup.description, 'EMBRAIAGEM');
  assert.ok(lookup.previousPartNumbers.includes('505297601'));
  assert.ok(lookup.previousPartNumbers.includes('515365601'));
  assert.ok(lookup.previousPartNumbers.includes('521325501'));
});

test('identifica substituição explícita sem inventar cadeia', () => {
  const html = `
    <html><body>
      <h1>CLUTCH</h1>
      <div>Número do artigo: 505 29 76-01</div>
      <p>Esta peça foi substituída por 599 76 47-01.</p>
    </body></html>
  `;

  const lookup = parseHusqvarnaPortalHtml(html, '505297601');
  assert.equal(lookup.status, 'SUPERSEDED');
  assert.equal(lookup.currentPartNumber, '599764701');
  assert.equal(lookup.officialUrl, 'https://portal.husqvarnagroup.com/br/spare-parts/?part=599764701');
});

test('marca revisão quando HTML não contém evidência de peça', () => {
  const lookup = parseHusqvarnaPortalHtml('<html><body><h1>Husqvarna Portal</h1></body></html>', '599764701');
  assert.equal(lookup.status, 'REVIEW');
  assert.equal(lookup.currentPartNumber, '599764701');
});
