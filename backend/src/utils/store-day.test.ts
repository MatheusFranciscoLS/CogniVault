import assert from 'node:assert/strict';
import test from 'node:test';
import { endOfStoreDay, shiftStoreDay, startOfStoreDay, todayInStore } from './store-day';

// Regressão real: a primeira versão do painel do dono usava
// `new Date('2026-09-18')` + `setHours(23,59,59,999)`. A string era parseada
// como meia-noite UTC e o setHours aplicava o fuso do processo, então em
// servidor UTC-3 o período "até hoje" terminava às 23:59 de ONTEM e o dono não
// via nenhum orçamento do próprio dia. Estes testes fixam as bordas em hora de
// Limeira (UTC-3, sem horário de verão desde 2019).

test('início do dia da loja é 03:00Z, não meia-noite UTC', () => {
  assert.equal(startOfStoreDay('2026-09-18')?.toISOString(), '2026-09-18T03:00:00.000Z');
  assert.equal(startOfStoreDay('2026-01-05')?.toISOString(), '2026-01-05T03:00:00.000Z');
});

test('fim do dia da loja inclui o dia inteiro e vaza para o dia seguinte em UTC', () => {
  assert.equal(endOfStoreDay('2026-09-18')?.toISOString(), '2026-09-19T02:59:59.999Z');
  assert.equal(endOfStoreDay('2026-12-31')?.toISOString(), '2027-01-01T02:59:59.999Z');
});

test('um orçamento salvo às 23h em Limeira cai dentro do filtro daquele dia', () => {
  const from = startOfStoreDay('2026-09-18')!;
  const to = endOfStoreDay('2026-09-18')!;
  // 23:30 de 18/09 em Limeira = 02:30Z de 19/09.
  const savedAt = new Date('2026-09-19T02:30:00.000Z');
  assert.ok(savedAt >= from && savedAt <= to, 'venda noturna deve entrar no dia comercial dela');
});

test('um orçamento salvo às 00:30 em Limeira não cai no dia anterior', () => {
  const to = endOfStoreDay('2026-09-17')!;
  // 00:30 de 18/09 em Limeira = 03:30Z de 18/09.
  const savedAt = new Date('2026-09-18T03:30:00.000Z');
  assert.ok(savedAt > to, 'madrugada não pertence ao dia comercial anterior');
});

test('aceita ISO completo usando só a parte da data', () => {
  assert.equal(startOfStoreDay('2026-09-18T15:44:12.000Z')?.toISOString(), '2026-09-18T03:00:00.000Z');
});

test('entrada inválida devolve null em vez de data suspeita', () => {
  for (const value of ['', '  ', 'hoje', '18/09/2026', null, undefined, 42, {}]) {
    assert.equal(startOfStoreDay(value), null);
    assert.equal(endOfStoreDay(value), null);
  }
});

test('deslocamento de dias não passa por fuso e atravessa mês e ano', () => {
  assert.equal(shiftStoreDay('2026-09-18', -29), '2026-08-20');
  assert.equal(shiftStoreDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftStoreDay('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftStoreDay('2026-12-31', 1), '2027-01-01');
});

test('hoje na loja sai como YYYY-MM-DD utilizável pelos outros helpers', () => {
  const today = todayInStore();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(startOfStoreDay(today) instanceof Date);
  assert.ok(endOfStoreDay(today)! > startOfStoreDay(today)!);
});
