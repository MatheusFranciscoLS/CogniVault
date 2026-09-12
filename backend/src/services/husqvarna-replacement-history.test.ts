import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSparePartReplacementHistory } from './husqvarna-replacement-history.service';

function payload(history: Array<{ articleNumber?: string; description?: string; unformattedArticleNumber?: string }>) {
  return {
    site: {
      spareParts: {
        byId: {
          replacementHistory: history,
        },
      },
    },
  };
}

test('monta a cadeia oficial da peça antiga até a mais recente', () => {
  const result = parseSparePartReplacementHistory(payload([
    { articleNumber: '533 04 02-23', unformattedArticleNumber: '533040223', description: 'Mais recente' },
    { articleNumber: '532 00 01-11', unformattedArticleNumber: '532000111', description: 'Intermediária' },
    { articleNumber: '516 57 27-00', unformattedArticleNumber: '516572700', description: 'Antiga' },
  ]), '516572700');

  assert.ok(result);
  assert.equal(result.latestPartNumber, '533040223');
  assert.equal(result.replacedBy, '532000111');
  assert.equal(result.isLatest, false);
  assert.equal(result.completeChain, true);
  assert.deepEqual(result.chain, [
    { from: '516572700', to: '532000111' },
    { from: '532000111', to: '533040223' },
  ]);
});

test('reconhece a primeira peça do histórico como a mais recente', () => {
  const result = parseSparePartReplacementHistory(payload([
    { articleNumber: '533 04 02-23', unformattedArticleNumber: '533040223' },
    { articleNumber: '516 57 27-00', unformattedArticleNumber: '516572700' },
  ]), '533040223');

  assert.ok(result);
  assert.equal(result.latestPartNumber, '533040223');
  assert.equal(result.replacedBy, null);
  assert.equal(result.isLatest, true);
  assert.equal(result.completeChain, true);
  assert.deepEqual(result.chain, []);
});

test('histórico vazio não inventa substituição', () => {
  const result = parseSparePartReplacementHistory(payload([]), '516572700');
  assert.ok(result);
  assert.equal(result.replacedBy, null);
  assert.equal(result.isLatest, null);
  assert.equal(result.completeChain, false);
  assert.deepEqual(result.history, []);
  assert.deepEqual(result.chain, []);
});

test('payload sem replacementHistory é tratado como indisponível', () => {
  assert.equal(parseSparePartReplacementHistory({ site: { spareParts: { byId: {} } } }, '516572700'), null);
});

test('quando o Portal omite a peça consultada, aponta apenas para a mais recente e marca cadeia parcial', () => {
  const result = parseSparePartReplacementHistory(payload([
    { articleNumber: '533 04 02-23', unformattedArticleNumber: '533040223' },
    { articleNumber: '532 00 01-11', unformattedArticleNumber: '532000111' },
  ]), '516572700');

  assert.ok(result);
  assert.equal(result.replacedBy, '533040223');
  assert.equal(result.completeChain, false);
  assert.deepEqual(result.chain, [{ from: '516572700', to: '533040223' }]);
});
