import assert from 'node:assert/strict';
import test from 'node:test';
import { isHostOrSubdomain, safeHusqvarnaAssetUrl } from './husqvarna-url';

test('host igual ao domínio e subdomínio são aceitos', () => {
  assert.equal(isHostOrSubdomain('husqvarnagroup.com', 'husqvarnagroup.com'), true);
  assert.equal(isHostOrSubdomain('portal.husqvarnagroup.com', 'husqvarnagroup.com'), true);
  assert.equal(isHostOrSubdomain('cdn-portal.husqvarnagroup.com', 'husqvarnagroup.com'), true);
  assert.equal(isHostOrSubdomain('PORTAL.HUSQVARNAGROUP.COM', 'husqvarnagroup.com'), true);
  // Ponto final de FQDN não deve mudar a decisão.
  assert.equal(isHostOrSubdomain('portal.husqvarnagroup.com.', 'husqvarnagroup.com'), true);
});

test('domínio que só termina com o texto do domínio é recusado', () => {
  // A razão de a comparação usar o ponto separador: um endsWith cru aceitaria
  // estes dois, que são de terceiros.
  assert.equal(isHostOrSubdomain('husqvarnagroup.com.atacante.net', 'husqvarnagroup.com'), false);
  assert.equal(isHostOrSubdomain('fakehusqvarnagroup.com', 'husqvarnagroup.com'), false);
  assert.equal(isHostOrSubdomain('husqvarnagroup.com.br', 'husqvarnagroup.com'), false);
});

test('URL de ativo aceita os domínios oficiais em https', () => {
  assert.equal(
    safeHusqvarnaAssetUrl('https://cdn-portal.husqvarnagroup.com/doc.pdf'),
    'https://cdn-portal.husqvarnagroup.com/doc.pdf',
  );
  assert.equal(
    safeHusqvarnaAssetUrl('https://p3.aprimocdn.net/husqvarna/vista.png'),
    'https://p3.aprimocdn.net/husqvarna/vista.png',
  );
  assert.equal(
    safeHusqvarnaAssetUrl('https://www.husqvarna.com/br/manual.pdf'),
    'https://www.husqvarna.com/br/manual.pdf',
  );
});

test('URL relativa resolve contra o portal', () => {
  assert.equal(
    safeHusqvarnaAssetUrl('/br/documentos/manual.pdf'),
    'https://portal.husqvarnagroup.com/br/documentos/manual.pdf',
  );
});

test('recusa esquema perigoso, http e domínio de terceiro', () => {
  // Este link terminaria em href no navegador do balcão.
  assert.equal(safeHusqvarnaAssetUrl('javascript:alert(1)'), null);
  assert.equal(safeHusqvarnaAssetUrl('data:text/html;base64,PHNjcmlwdD4='), null);
  assert.equal(safeHusqvarnaAssetUrl('http://portal.husqvarnagroup.com/doc.pdf'), null);
  assert.equal(safeHusqvarnaAssetUrl('https://atacante.net/doc.pdf'), null);
  assert.equal(safeHusqvarnaAssetUrl('https://husqvarnagroup.com.atacante.net/doc.pdf'), null);
});

test('valor ausente ou inválido devolve null em vez de string suspeita', () => {
  for (const value of ['', '   ', null, undefined, 42, {}, [], 'não é url']) {
    assert.equal(safeHusqvarnaAssetUrl(value), null);
  }
});
