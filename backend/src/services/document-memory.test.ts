import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTechnicalMemoryChunks } from './document-memory';

test('groups technical memory by model, page and section without copying part numbers', () => {
  const chunks = buildTechnicalMemoryChunks([
    { model: '372 XP', pnc: '965702302', page: 12, section: 'CLUTCH', position: '1', name: 'Clutch assembly', notes: '3/8' },
    { model: '372 XP', pnc: '965702302', page: 12, section: 'CLUTCH', position: '2', name: 'Clutch spring' },
    { model: '372 XP', pnc: '965702302', page: 14, section: 'CHAIN BRAKE', position: '3', name: 'Brake band' },
  ]);

  assert.equal(chunks.length, 2);
  assert.match(chunks[0].content, /CLUTCH/);
  assert.match(chunks[0].content, /Clutch spring/);
  assert.doesNotMatch(chunks[0].content, /503744401/);
});

test('separates PNC-specific technical memory', () => {
  const chunks = buildTechnicalMemoryChunks([
    { model: 'TS114', pnc: '970622401', page: 20, section: 'DECK', name: 'Blade' },
    { model: 'TS114', pnc: '970622402', page: 20, section: 'DECK', name: 'Blade' },
  ]);
  assert.equal(chunks.length, 2);
  assert.notEqual(chunks[0].normalizedPnc, chunks[1].normalizedPnc);
});

test('splits very large exploded views into bounded chunks', () => {
  const parts = Array.from({ length: 61 }, (_, index) => ({
    model: 'Z460', page: 30, section: 'CUTTING DECK', position: String(index + 1), name: `Part ${index + 1}`,
  }));
  const chunks = buildTechnicalMemoryChunks(parts, 20);
  assert.equal(chunks.length, 4);
});
