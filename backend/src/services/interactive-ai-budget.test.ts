import assert from 'node:assert/strict';
import test from 'node:test';
import {
  interactiveAiFailureSettlementTokens,
  interactiveAiReservationFitsBudget,
  interactiveAiSettlementTokens,
} from './interactive-ai-budget';

test('reserva distribuída cabe quando o saldo cobre o teto da requisição', () => {
  assert.equal(interactiveAiReservationFitsBudget(80_000, 120_000, 12_000), true);
  assert.equal(interactiveAiReservationFitsBudget(108_000, 120_000, 12_000), true);
});

test('reserva distribuída recusa quando concorrência poderia ultrapassar a cota', () => {
  assert.equal(interactiveAiReservationFitsBudget(108_001, 120_000, 12_000), false);
  assert.equal(interactiveAiReservationFitsBudget(120_000, 120_000, 1), false);
});

test('valores inválidos nunca liberam uma chamada de IA', () => {
  assert.equal(interactiveAiReservationFitsBudget(Number.NaN, 120_000, 12_000), false);
  assert.equal(interactiveAiReservationFitsBudget(0, 120_000, 0), false);
  assert.equal(interactiveAiReservationFitsBudget(-1, 120_000, 12_000), false);
});

test('falha antes da chamada libera a reserva, mas falha depois da tentativa mantém o teto conservador', () => {
  const releaseUnusedReservation = interactiveAiFailureSettlementTokens(false);
  assert.notEqual(releaseUnusedReservation, null);
  assert.equal(interactiveAiSettlementTokens(releaseUnusedReservation), 0);
  assert.equal(interactiveAiFailureSettlementTokens(true), null);
});

test('usage só liquida a reserva quando o provedor reporta consumo positivo', () => {
  assert.equal(interactiveAiSettlementTokens(1_234.9), 1_234);
  assert.equal(interactiveAiSettlementTokens('42'), 42);
  assert.equal(interactiveAiSettlementTokens(0), null);
  assert.equal(interactiveAiSettlementTokens(undefined), null);
  assert.equal(interactiveAiSettlementTokens(Number.NaN), null);
});
