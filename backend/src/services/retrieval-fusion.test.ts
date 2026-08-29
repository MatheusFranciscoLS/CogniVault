import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizedReciprocalRankFusionScores,
  reciprocalRankFusionScores,
} from './retrieval-fusion';

test('RRF favorece candidato encontrado pela busca lexical e semântica', () => {
  const semantic = [{ id: 'semantic-only' }, { id: 'agreement' }];
  const lexical = [{ id: 'agreement' }, { id: 'lexical-only' }];
  const scores = reciprocalRankFusionScores([semantic, lexical]);

  assert.ok((scores.get('agreement') || 0) > (scores.get('semantic-only') || 0));
  assert.ok((scores.get('agreement') || 0) > (scores.get('lexical-only') || 0));
});

test('RRF preserva a ordem quando existe apenas um recuperador', () => {
  const scores = normalizedReciprocalRankFusionScores([[{ id: 'first' }, { id: 'second' }, { id: 'third' }]]);
  assert.equal(scores.get('first'), 1);
  assert.ok((scores.get('first') || 0) > (scores.get('second') || 0));
  assert.ok((scores.get('second') || 0) > (scores.get('third') || 0));
});

test('RRF ignora IDs repetidos dentro do mesmo ranking', () => {
  const duplicated = reciprocalRankFusionScores([[{ id: 'part' }, { id: 'part' }]]);
  const single = reciprocalRankFusionScores([[{ id: 'part' }]]);
  assert.equal(duplicated.get('part'), single.get('part'));
});
