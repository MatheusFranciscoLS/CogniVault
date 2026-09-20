import test from 'node:test';
import assert from 'node:assert/strict';
import { OfficialPartIndexService } from './official-part-index.service';

/**
 * `record` é chamado com `void` — promessa solta, de propósito: o balcão não
 * pode esperar 283 gravações para ver a lista de peças na tela.
 *
 * **Isso só é seguro porque ela nunca rejeita.** E até aqui essa garantia era
 * um comentário meu, não um fato verificado. O preço de estar errado é alto:
 * `server.ts` trata `unhandledRejection` desligando o processo com código 1, e
 * no Render isso vira reinício — o atendente vê "Preparando o servidor" no meio
 * do atendimento por causa de um índice de busca.
 *
 * Estes testes rodam **sem banco** (não há `DATABASE_URL` no sandbox), o que é
 * justamente o pior caso: a chamada ao Postgres falha de verdade e a função
 * tem que engolir.
 */

test('record não rejeita quando o banco está fora', async () => {
  // Sem DATABASE_URL o upsert falha de verdade. É o caso "banco indisponível",
  // e ele NÃO pode derrubar o servidor.
  await assert.doesNotReject(() => OfficialPartIndexService.record('BRIGGS', '104M02-0002-F1', [
    { partNumber: '595353', name: 'HEAD, Cylinder', position: '5', assembly: 'Cylinder Head', quantity: null },
  ]));
});

test('record não rejeita com entrada inválida', async () => {
  // A normalização do modelo e o `parts.length` ficam FORA do try/catch. Se
  // alguém passar lixo, o erro tem que aparecer no chamador (que está dentro
  // de um try), nunca como rejeição solta.
  const lixo: unknown[] = [null, undefined, '', 0, {}, []];
  for (const valor of lixo) {
    await assert.doesNotReject(
      () => OfficialPartIndexService.record('BRIGGS', valor as string, []),
      `modelo = ${JSON.stringify(valor)}`,
    );
  }
});

test('record não rejeita com peça malformada', async () => {
  await assert.doesNotReject(() => OfficialPartIndexService.record('KAWASAKI', 'FX921V-ES06', [
    { partNumber: '', name: '', position: null, assembly: null, quantity: null },
    { partNumber: '11009-2056', name: 'GASKET', position: undefined, assembly: undefined, quantity: undefined },
  ]));
});

test('byCode não rejeita quando o banco está fora', async () => {
  // Mesma regra do outro lado: a consulta é awaitada, mas um erro aqui viraria
  // 500 na tela do balcão em vez de "não achei". Ela devolve lista vazia.
  const vazio = await OfficialPartIndexService.byCode('592358');
  assert.deepEqual(vazio, []);
});

test('byCode recusa código curto sem tocar no banco', async () => {
  // Menos de 4 caracteres normalizados nunca é código de peça. Recusar antes
  // evita uma consulta por tecla digitada.
  for (const curto of ['', '1', '12', '123', '  -  ']) {
    assert.deepEqual(await OfficialPartIndexService.byCode(curto), [], JSON.stringify(curto));
  }
});
