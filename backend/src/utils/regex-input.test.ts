import assert from 'node:assert/strict';
import test from 'node:test';
import { capRegexInput, MAX_REGEX_INPUT_LENGTH } from './regex-input';
import { formatBriggsModelForSearch, formatKawasakiModelForSearch } from './engine-model';
import { extractExplicitOccurrenceSection } from '../services/explicit-occurrence-constraints';
import { extractLikelyModel, extractLikelyPnc } from '../services/chat-reliability';
import { stripExplicitSerialContext } from '../services/candidate-specificity';

test('capRegexInput corta só o que passa do teto', () => {
  assert.equal(capRegexInput('abc', 5), 'abc');
  assert.equal(capRegexInput('abcdef', 3), 'abc');
  assert.equal(capRegexInput('x'.repeat(MAX_REGEX_INPUT_LENGTH + 50)).length, MAX_REGEX_INPUT_LENGTH);
});

// Entrada hostil e enorme: cada função tem que responder rápido. O teste mede
// tempo de relógio com folga grande; sem o teto, 200 mil caracteres de espaço em
// regex polinomial levam dezenas de segundos.
const HOSTILE = ' '.repeat(200_000) + '(';

function fast(label: string, run: () => unknown): void {
  const start = process.hrtime.bigint();
  run();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(ms < 1000, `${label} levou ${ms.toFixed(0)} ms com entrada hostil`);
}

test('entrada hostil e enorme não trava nenhuma das funções com regex polinomial', () => {
  fast('formatBriggsModelForSearch', () => formatBriggsModelForSearch('motor briggs' + HOSTILE));
  fast('formatKawasakiModelForSearch', () => formatKawasakiModelForSearch('motor kawasaki' + HOSTILE));
  fast('extractExplicitOccurrenceSection', () => extractExplicitOccurrenceSection('vista de ' + HOSTILE));
  fast('extractLikelyPnc', () => extractLikelyPnc('pnc ' + '1 '.repeat(100_000)));
  fast('extractLikelyModel', () => extractLikelyModel(HOSTILE + '143RII'));
  fast('stripExplicitSerialContext', () => stripExplicitSerialContext('serial ' + HOSTILE));
});

test('o teto não muda o resultado de uma entrada normal', () => {
  assert.equal(formatBriggsModelForSearch('Motor Briggs 104M02-0002-F1'), '104M02-0002-F1');
  assert.equal(extractLikelyPnc('qual o pnc 967332901 da peça?'), '967332901');
});
