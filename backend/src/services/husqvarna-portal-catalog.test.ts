import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHusqvarnaPortalSearchHtml } from './husqvarna-portal-catalog.service';

test('extrai produto e IPL oficial do HTML de busca por PNC', () => {
  const html = `
    <main>
      <div>HUSQVARNA 327P5x</div>
      <div>965195201</div>
      <span>DESCONTINUADO</span>
      <a href="https://www-static-nw.husqvarna.com/hbd/tdrdownload/v2/pub000099999/doc000199999/IPL/token">
        IPL, IPL UPDATE, 327P5x, 2019-12, SAW HEAD
      </a>
    </main>
  `;

  const result = parseHusqvarnaPortalSearchHtml(html, '965195201');
  assert.ok(result);
  assert.equal(result.pnc, '965195201');
  assert.equal(result.productName, 'HUSQVARNA 327P5x');
  assert.equal(result.discontinued, true);
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].type, 'IPL');
  assert.equal(result.documents[0].date, '2019-12');
  assert.match(result.documents[0].url, /husqvarna\.com\/hbd\/tdrdownload/);
});

test('aceita IPL de impressão do próprio portal e prioriza IPL antes de manual', () => {
  const html = `
    <div>HUSQVARNA 460</div>
    <div>970550020</div>
    <a href="https://portal.husqvarnagroup.com/br/motosserras/460/?article=970550020&amp;printipl=true&amp;iplId=HVA_PL-000018402">
      IPL Update, 460, 2025-02
    </a>
    <a href="https://content.tdr.dss.husqvarnagroup.net/tdrdownload/v2/pub000012345/doc000067890/OM/token">
      OM, Husqvarna 460, 2024-11, PT
    </a>
  `;

  const result = parseHusqvarnaPortalSearchHtml(html, '970550020');
  assert.ok(result);
  assert.equal(result.documents.length, 2);
  assert.equal(result.documents[0].type, 'IPL');
  assert.equal(result.documents[1].type, 'OM');
  assert.equal(result.documents[1].language, 'PT');
});

test('preserva IPLs diferentes do mesmo produto quando o iplId muda', () => {
  const html = `
    <div>HUSQVARNA 327P5x</div>
    <div>965195201</div>
    <a href="https://portal.husqvarnagroup.com/br/produtos/327p5x/?article=965195201&amp;printipl=true&amp;iplId=HVA_PL-000010001">
      IPL Update, 327P5x, 2019-12
    </a>
    <a href="https://portal.husqvarnagroup.com/br/produtos/327p5x/?article=965195201&amp;printipl=true&amp;iplId=HVA_PL-000010002">
      IPL Update, 327P5x, 2015-02
    </a>
  `;

  const result = parseHusqvarnaPortalSearchHtml(html, '965195201');
  assert.ok(result);
  assert.equal(result.documents.length, 2);
  assert.equal(result.documents[0].date, '2019-12');
  assert.equal(result.documents[1].date, '2015-02');
});

test('ignora links externos mesmo quando tentam parecer tdrdownload', () => {
  const html = `
    <div>HUSQVARNA TESTE</div>
    <div>123456789</div>
    <a href="https://example.com/tdrdownload/falso/IPL/documento">IPL falso</a>
  `;

  const result = parseHusqvarnaPortalSearchHtml(html, '123456789');
  assert.ok(result);
  assert.equal(result.documents.length, 0);
});

test('não aceita documento corporativo RD/REACH como catálogo técnico do PNC', () => {
  const html = `
    <html>
      <head><title>Husqvarna Portal</title></head>
      <body>
        <a href="https://portal.husqvarnagroup.com/b2b/tdrdownload/v2/pub000082523/doc000150260/RD/ZE5ZPQydtDI-PFI7CjWrGScLfWI?httproute=True">
          Microsoft Word - REACH Article 33_General Letter[79].doc
        </a>
      </body>
    </html>
  `;

  const result = parseHusqvarnaPortalSearchHtml(html, '965195201');
  assert.equal(result, null);
});
