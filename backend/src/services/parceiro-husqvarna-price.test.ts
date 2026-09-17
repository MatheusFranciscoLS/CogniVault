import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProductDetailUrl, parseConsumerPriceFromProductDetail } from './parceiro-husqvarna-price.service';

// Base64 de {"Id":"999999999","Description":"PECA EXEMPLO TESTE",
// "BusinessUnit":"SSP","ConsumerPrice":50.00,"BaseResalePrice":30.00} — dado
// fabricado, não é preço real de nenhuma peça. O formato (campo oculto
// dentro de um fragmento HTML) é real; os números não são.
const FAKE_PRODUCT_BASE64 =
  'eyJJZCI6Ijk5OTk5OTk5OSIsIkRlc2NyaXB0aW9uIjoiUEVDQSBFWEVNUExPIFRFU1RFIiwiQnVzaW5lc3NVbml0IjoiU1NQIiwiQ29uc3VtZXJQcmljZSI6NTAuMDAsIkJhc2VSZXNhbGVQcmljZSI6MzAuMDB9';

function fakeHtml(inputTag: string): string {
  return `\r\n  <div class="row">\r\n    ${inputTag}\r\n    <div class="medium-12">...</div>\r\n  </div>`;
}

test('lê ConsumerPrice do campo oculto inputFullProduct (value antes de id)', () => {
  const html = fakeHtml(`<input type="hidden" value="${FAKE_PRODUCT_BASE64}" id="inputFullProduct" />`);
  const price = parseConsumerPriceFromProductDetail({ Status: true, Html: html, Message: null });
  assert.equal(price, 50);
});

test('lê ConsumerPrice mesmo com id antes de value (ordem de atributos não importa)', () => {
  const html = fakeHtml(`<input id="inputFullProduct" type="hidden" value="${FAKE_PRODUCT_BASE64}" />`);
  const price = parseConsumerPriceFromProductDetail({ Status: true, Html: html, Message: null });
  assert.equal(price, 50);
});

test('retorna null quando Status é false, sem tentar ler o Html', () => {
  const html = fakeHtml(`<input type="hidden" value="${FAKE_PRODUCT_BASE64}" id="inputFullProduct" />`);
  const price = parseConsumerPriceFromProductDetail({ Status: false, Html: html, Message: 'Sessão expirada' });
  assert.equal(price, null);
});

test('retorna null quando o campo inputFullProduct não existe (layout mudou)', () => {
  const price = parseConsumerPriceFromProductDetail({
    Status: true,
    Html: '<div>Produto não encontrado</div>',
    Message: null,
  });
  assert.equal(price, null);
});

test('retorna null quando o base64 não decodifica em JSON válido', () => {
  const html = fakeHtml('<input type="hidden" value="isso-nao-e-base64-de-json" id="inputFullProduct" />');
  const price = parseConsumerPriceFromProductDetail({ Status: true, Html: html, Message: null });
  assert.equal(price, null);
});

test('retorna null quando Html é null', () => {
  const price = parseConsumerPriceFromProductDetail({ Status: true, Html: null, Message: null });
  assert.equal(price, null);
});

test('buildProductDetailUrl monta a URL com os parâmetros confirmados no print real', () => {
  const url = buildProductDetailUrl('577484001', 'SSP');
  assert.ok(url.startsWith('https://parceirohusqvarna.com/Product/ProductDetail?'));
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('ProductId'), '577484001');
  assert.equal(parsed.searchParams.get('ProductBusinessUnit'), 'SSP');
  assert.ok(parsed.searchParams.has('_'));
});
