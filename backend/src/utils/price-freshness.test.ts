import test from 'node:test';
import assert from 'node:assert/strict';
import { priceFreshness, storeMonth } from './price-freshness';

test('compra do mês corrente vale como está', () => {
  assert.equal(priceFreshness('2026-09-19T14:00:00.000Z', '2026-09'), 'FRESH');
  assert.equal(priceFreshness('2026-09-01T12:00:00.000Z', '2026-09'), 'FRESH');
});

test('compra de mês anterior mostra o preço, mas pede conferência', () => {
  assert.equal(priceFreshness('2026-08-31T12:00:00.000Z', '2026-09'), 'STALE');
  assert.equal(priceFreshness('2025-12-10T12:00:00.000Z', '2026-09'), 'STALE');
});

test('o mês é o da LOJA, não o do servidor', () => {
  // O Render roda em UTC e a loja em America/Sao_Paulo (UTC-3). Estes dois
  // instantes são o mesmo tipo de armadilha que o bug de fuso já corrigido
  // nesta base: virada de mês em que UTC e a loja discordam.

  // 1º de setembro, 01h00 UTC = 31 de AGOSTO, 22h00 na loja.
  // Lendo pelo relógio do servidor isso seria setembro; para a loja é agosto.
  assert.equal(storeMonth(new Date('2026-09-01T01:00:00.000Z')), '2026-08');
  assert.equal(priceFreshness('2026-09-01T01:00:00.000Z', '2026-09'), 'STALE');

  // 1º de setembro, 05h00 UTC = 1º de setembro, 02h00 na loja. Setembro nos dois.
  assert.equal(storeMonth(new Date('2026-09-01T05:00:00.000Z')), '2026-09');
  assert.equal(priceFreshness('2026-09-01T05:00:00.000Z', '2026-09'), 'FRESH');
});

test('sem data de compra não afirma que o preço está atual', () => {
  // O caminho perigoso é o contrário: tratar ausência como FRESH faria o balcão
  // vender por um preço que ninguém garantiu.
  for (const vazio of [null, undefined, '']) {
    assert.equal(priceFreshness(vazio, '2026-09'), 'UNKNOWN');
  }
});

test('data ilegível não vira preço atual', () => {
  assert.equal(priceFreshness('31/08/2026', '2026-09'), 'UNKNOWN');
  assert.equal(priceFreshness('sem data', '2026-09'), 'UNKNOWN');
});

test('data no futuro é erro de cadastro, não preço atual', () => {
  assert.equal(priceFreshness('2027-01-10T12:00:00.000Z', '2026-09'), 'UNKNOWN');
});

test('aceita Date além de string', () => {
  assert.equal(priceFreshness(new Date('2026-09-19T14:00:00.000Z'), '2026-09'), 'FRESH');
  assert.equal(priceFreshness(new Date('2026-07-19T14:00:00.000Z'), '2026-09'), 'STALE');
});

test('a virada de mês é abrupta de propósito — e o dono precisa saber disso', () => {
  // Regra literal do dono ("desse mês" / "do mês passado"). A consequência é um
  // degrau: compra no dia 31/08 fica STALE já em 01/09, com um dia de idade,
  // enquanto compra em 01/09 segue FRESH no dia 30/09, com 29 dias.
  //
  // Está travado em teste para a mudança ser deliberada: se o dono preferir
  // "últimos 30 dias", é aqui que muda, e o teste falha avisando.
  assert.equal(priceFreshness('2026-08-31T15:00:00.000Z', '2026-09'), 'STALE');
  assert.equal(priceFreshness('2026-09-01T15:00:00.000Z', '2026-09'), 'FRESH');
});
