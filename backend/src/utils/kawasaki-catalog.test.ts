import test from 'node:test';
import assert from 'node:assert/strict';
import { kawasakiCatalogUrl, kawasakiDirectModels, kawasakiLabelToUrlSegment } from './kawasaki-catalog';

test('modelo confirmado abre direto na vista explodida', () => {
  // URL montada a partir do caminho percorrido no navegador: digitar o modelo,
  // clicar na opção do autocompletar e cair na grade. Abrir esta URL carrega a
  // vista com os códigos (11009-2056, 11061-7038, …).
  const { url, direct, model } = kawasakiCatalogUrl('FX921V-ES06');
  assert.equal(direct, true);
  assert.equal(model, 'FX921V-ES06');
  assert.equal(
    url,
    'https://kawasakienginesusa.com/parts-lookup?aribrand=kwe#/Kawasaki_Engine/FX921V-ES06_4_Stroke_Engine_FX921V/63e707fb-f388-4087-95ee-f0dbb8238447',
  );
});

test('aceita o modelo como o balcão digita', () => {
  for (const digitado of ['fx921v-es06', 'FX921V ES06', 'FX921VES06', ' fx921ves06 ']) {
    assert.equal(kawasakiCatalogUrl(digitado).direct, true, digitado);
  }
});

test('modelo sem GUID confirmado cai na busca, nunca num link vazio', () => {
  // Um GUID chutado abriria a vista de OUTRO motor, e peça de outro motor é
  // devolução no balcão. Melhor um clique a mais do que um link errado.
  for (const desconhecido of ['FR691V', 'FX730V-BS00', 'ALGO', '']) {
    const { url, direct, model } = kawasakiCatalogUrl(desconhecido);
    assert.equal(direct, false, desconhecido);
    assert.equal(model, null, desconhecido);
    assert.equal(url, 'https://kawasakienginesusa.com/parts-lookup?aribrand=kwe', desconhecido);
  }
  assert.equal(kawasakiCatalogUrl(null).direct, false);
  assert.equal(kawasakiCatalogUrl(undefined).direct, false);
});

test('rótulo do autocompletar vira segmento de URL', () => {
  assert.equal(
    kawasakiLabelToUrlSegment('FX921V-ES06 4 Stroke Engine FX921V'),
    'FX921V-ES06_4_Stroke_Engine_FX921V',
  );
  assert.equal(kawasakiLabelToUrlSegment('  espaco   duplo  '), 'espaco_duplo');
});

test('a lista de modelos diretos é a que a tela pode prometer', () => {
  const modelos = kawasakiDirectModels();
  assert.ok(modelos.includes('FX921V-ES06'));
  // Todo modelo listado tem que realmente abrir direto — senão a tela promete
  // o que o link não entrega.
  for (const modelo of modelos) {
    assert.equal(kawasakiCatalogUrl(modelo).direct, true, modelo);
  }
});
