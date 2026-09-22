import assert from 'node:assert/strict';
import test from 'node:test';
import {
  interactiveAiFailureSettlementTokens,
  interactiveAiReservationFitsBudget,
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
  assert.equal(interactiveAiFailureSettlementTokens(false), 0);
  assert.equal(interactiveAiFailureSettlementTokens(true), null);
});
