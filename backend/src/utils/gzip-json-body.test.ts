import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { GzipJsonError, decodeGzipJson } from './gzip-json-body';

const pack = (value: unknown) => gzipSync(Buffer.from(JSON.stringify(value), 'utf8'));

test('lê o objeto e devolve um hash estável do conteúdo', async () => {
  const a = await decodeGzipJson(pack({ pecas: [{ codigo: '1' }] }), 1_000_000);
  const b = await decodeGzipJson(pack({ pecas: [{ codigo: '1' }] }), 1_000_000);
  const c = await decodeGzipJson(pack({ pecas: [{ codigo: '2' }] }), 1_000_000);
  assert.deepEqual(a.value, { pecas: [{ codigo: '1' }] });
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.equal(a.hash, b.hash, 'o mesmo conteúdo dá o mesmo hash');
  assert.notEqual(a.hash, c.hash, 'conteúdo diferente dá hash diferente');
});

test('recusa corpo vazio, ausente, não comprimido e corrompido, sem lançar erro estranho', async () => {
  for (const body of [undefined, null, {}, 'texto', Buffer.alloc(0), Buffer.from('{"pecas":[]}'), Buffer.from([0x1f, 0x8b, 1, 2, 3])]) {
    await assert.rejects(() => decodeGzipJson(body, 1_000_000), GzipJsonError, String(body));
  }
});

test('recusa JSON inválido e o que não é objeto', async () => {
  await assert.rejects(() => decodeGzipJson(gzipSync(Buffer.from('{quebrado')), 1_000_000), /JSON válido/);
  for (const value of [[], 'texto', 42, null]) {
    await assert.rejects(() => decodeGzipJson(pack(value), 1_000_000), /formato esperado/, JSON.stringify(value));
  }
});

test('arquivo pequeno que vira gigante ao descomprimir é barrado pelo teto de saída', async () => {
  const bomb = gzipSync(Buffer.alloc(5_000_000, 0x20));
  assert.ok(bomb.length < 20_000, 'o corpo comprimido é minúsculo');
  await assert.rejects(() => decodeGzipJson(bomb, 1_000_000), /maior do que o aceito/);
});
