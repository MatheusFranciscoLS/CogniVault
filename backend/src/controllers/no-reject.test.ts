import test from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/prisma';
import { masterPartPricesController } from './master-part-prices.controller';
import { partPickerController } from './part-picker.controller';
import { officialPartIndexController } from './official-part-index.controller';

/**
 * Handler de rota NÃO pode rejeitar.
 *
 * As rotas deste projeto são registradas como
 * `(req, res) => controller.metodo(req, res)`, e o Express 4 **não captura**
 * rejeição de promessa. Uma consulta que falha vira `unhandledRejection`, e
 * `server.ts` responde a isso desligando o processo (código 1). No Render isso
 * é reinício: o atendente vê "Preparando o servidor" no meio do atendimento,
 * por causa de uma consulta de preço.
 *
 * **Os três controladores criados em 2026-09-19/20 não tinham try/catch
 * nenhum** — contra 8 no de orçamento e 4 no de admin. Nenhum teste pegava,
 * porque nenhum teste chamava um handler com o banco fora. Este chama.
 *
 * **A primeira versão destes testes passava pelo motivo errado**, e vale
 * registrar porque é a armadilha que eles existem para evitar. Eu contava com
 * a ausência de `DATABASE_URL` para a consulta falhar. Só que na máquina de
 * desenvolvimento ela **está** definida: a consulta funcionava, devolvia lista
 * vazia (o `tenantId` fictício não casa com nada) e o `catch` nunca era
 * exercitado. Neutralizar o `catch` não quebrava teste nenhum — verde falso.
 *
 * Agora a falha é **injetada**: o método do Prisma é trocado por um que lança,
 * o que exercita o `catch` com ou sem banco, em qualquer máquina e no CI.
 */

/** Troca um método do Prisma por um que lança, e devolve como restaurar. */
function comBancoQuebrado<T extends keyof typeof prisma>(
  modelo: T,
  metodo: string,
): () => void {
  const alvo = prisma[modelo] as unknown as Record<string, unknown>;
  const original = alvo[metodo];
  alvo[metodo] = () => Promise.reject(new Error('banco fora (injetado pelo teste)'));
  return () => { alvo[metodo] = original; };
}

const USUARIO = { id: 'u1', tenantId: 't1', role: 'MECHANIC' as const, email: 'balcao@loja.local' };

/** `res` mínimo que registra o que o handler respondeu. */
function fakeRes() {
  const estado = { status: 200, corpo: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    status(codigo: number) { estado.status = codigo; return res; },
    json(corpo: unknown) { estado.corpo = corpo; return res; },
    set(chave: string, valor: string) { estado.headers[chave] = valor; return res; },
    send(corpo: unknown) { estado.corpo = corpo; return res; },
    end() { return res; },
  };
  return { res: res as unknown as Response, estado };
}

function fakeReq(query: Record<string, unknown>, body: unknown = {}): AuthenticatedRequest {
  return { user: USUARIO, query, body } as unknown as AuthenticatedRequest;
}

test('preço em lote responde em vez de rejeitar com o banco fora', async () => {
  const restaurar = comBancoQuebrado('masterPart', 'findMany');
  try {
    const { res, estado } = fakeRes();
    await assert.doesNotReject(() => masterPartPricesController.byCodes(
      fakeReq({}, { codes: ['587106701', '592358'] }),
      res,
    ));
    // Degrada certo: mapa vazio, e a lista de peças continua na tela sem preço.
    assert.deepEqual(estado.corpo, { prices: {} });
  } finally {
    restaurar();
  }
});

test('palpite de peça responde em vez de rejeitar com o banco fora', async () => {
  const restaurar = comBancoQuebrado('part', 'findMany');
  try {
    const { res, estado } = fakeRes();
    await assert.doesNotReject(() => partPickerController.guess(
      fakeReq({ model: '143RII', q: 'a peça que segura a lâmina' }),
      res,
    ));
    assert.deepEqual(estado.corpo, { guesses: [] });
  } finally {
    restaurar();
  }
});

test('índice oficial responde em vez de rejeitar com o banco fora', async () => {
  const restaurar = comBancoQuebrado('officialPartIndex', 'findMany');
  try {
    const { res, estado } = fakeRes();
    await assert.doesNotReject(() => officialPartIndexController.byCode(
      fakeReq({ code: '592358' }),
      res,
    ));
    assert.deepEqual(estado.corpo, { officialParts: [] });
  } finally {
    restaurar();
  }
});

test('entrada malformada também não rejeita', async () => {
  // Corpo sem `codes`, query com objeto no lugar de texto: nada disso pode
  // derrubar o processo.
  const casos: Array<[Record<string, unknown>, unknown]> = [
    [{}, {}],
    [{}, { codes: 'nao e lista' }],
    [{}, { codes: [null, 42, {}] }],
    [{ model: {}, q: {} }, {}],
    [{ code: {} }, {}],
  ];
  for (const [query, body] of casos) {
    const a = fakeRes();
    await assert.doesNotReject(() => masterPartPricesController.byCodes(fakeReq(query, body), a.res), JSON.stringify(body));
    const b = fakeRes();
    await assert.doesNotReject(() => partPickerController.guess(fakeReq(query, body), b.res), JSON.stringify(query));
    const c = fakeRes();
    await assert.doesNotReject(() => officialPartIndexController.byCode(fakeReq(query, body), c.res), JSON.stringify(query));
  }
});
