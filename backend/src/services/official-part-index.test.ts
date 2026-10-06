import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../config/prisma';
import { OfficialPartIndexService } from './official-part-index.service';

/** Troca `officialPartIndex.upsert` por um espião e devolve como restaurar. */
function espiaUpsert(comportamento: () => Promise<unknown>) {
  const alvo = prisma.officialPartIndex as unknown as Record<string, unknown>;
  const original = alvo.upsert;
  const chamadas: unknown[] = [];
  alvo.upsert = (args: unknown) => { chamadas.push(args); return comportamento(); };
  return { chamadas, restaurar: () => { alvo.upsert = original; } };
}

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
  // O caso "banco indisponível" NÃO pode derrubar o servidor.
  //
  // **A falha é INJETADA.** A primeira versão confiava em não haver banco — mas
  // o `DATABASE_URL` desta máquina apontava para a produção, o `upsert` rodava
  // DE VERDADE e gravou `595353 / HEAD, Cylinder` em `OfficialPartIndex`. Um
  // teste de resiliência a falha estava fabricando dado oficial falso.
  const { chamadas, restaurar } = espiaUpsert(() => Promise.reject(new Error('banco fora (injetado pelo teste)')));
  try {
    await assert.doesNotReject(() => OfficialPartIndexService.record('BRIGGS', '104M02-0002-F1', [
      { partNumber: '595353', name: 'HEAD, Cylinder', position: '5', assembly: 'Cylinder Head', quantity: null },
    ]));
    // Prova que o `catch` foi exercitado: o upsert FOI tentado, e falhou.
    assert.equal(chamadas.length, 1, 'o upsert nem chegou a ser tentado — o teste não exercitou o catch');
  } finally {
    restaurar();
  }
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

test('record não rejeita com peça malformada, e só grava a que tem código', async () => {
  // Também sem tocar em banco: com a produção acessível, a segunda peça virava
  // um pareamento Kawasaki FX921V-ES06 → 11009-2056 INVENTADO na tabela oficial.
  const { chamadas, restaurar } = espiaUpsert(() => Promise.resolve({}));
  try {
    await assert.doesNotReject(() => OfficialPartIndexService.record('KAWASAKI', 'FX921V-ES06', [
      { partNumber: '', name: '', position: null, assembly: null, quantity: null },
      { partNumber: '11009-2056', name: 'GASKET', position: undefined, assembly: undefined, quantity: undefined },
    ]));
    // A peça sem código é descartada ANTES do banco; só a válida chega ao upsert.
    assert.equal(chamadas.length, 1);
  } finally {
    restaurar();
  }
});

test('byCode não rejeita quando o banco está fora', async () => {
  // Mesma regra do outro lado: a consulta é awaitada, mas um erro aqui viraria
  // 500 na tela do balcão em vez de "não achei". Ela devolve lista vazia.
  //
  // **A falha é INJETADA, não esperada.** A primeira versão confiava em não
  // haver banco e afirmava "lista vazia" — mas o `DATABASE_URL` desta máquina
  // aponta para a produção, a consulta funcionava, e o teste só passava porque
  // o índice estava vazio. Em 21/09 uma consulta real da Briggs indexou o
  // código 592358 e o teste passou a reprovar. Ele nunca exercitou o `catch`.
  const alvo = prisma.officialPartIndex as unknown as Record<string, unknown>;
  const original = alvo.findMany;
  alvo.findMany = () => Promise.reject(new Error('banco fora (injetado pelo teste)'));
  try {
    const vazio = await OfficialPartIndexService.byCode('592358');
    assert.deepEqual(vazio, []);
  } finally {
    alvo.findMany = original;
  }
});

test('byCode recusa código curto sem tocar no banco', async () => {
  // Menos de 4 caracteres normalizados nunca é código de peça. Recusar antes
  // evita uma consulta por tecla digitada.
  for (const curto of ['', '1', '12', '123', '  -  ']) {
    assert.deepEqual(await OfficialPartIndexService.byCode(curto), [], JSON.stringify(curto));
  }
});
