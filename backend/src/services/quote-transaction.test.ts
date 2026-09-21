import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../config/prisma';
import { QuoteService, QUOTE_TX_OPTIONS } from './quote.service';

/**
 * A cesta não pode caber na janela padrão de 5 s do Prisma.
 *
 * **Isto não é precaução: é uma falha que já aconteceu no ar.** Log do Render em
 * 18/09/2026 21:16 UTC, no `PUT /api/quotes/draft`:
 *
 *     Transaction already closed: A commit cannot be executed on an expired
 *     transaction. The timeout for this transaction was 5000 ms, however
 *     6725 ms passed since the start of the transaction.
 *
 * O atendente recebeu 500 e a cesta ficou só no navegador dele ("Só neste
 * aparelho"). Não foi trabalho pesado — são três comandos — foi latência entre
 * Render free e Supabase free.
 *
 * Todas as outras transações desta base já declaram o teto; as duas da cesta
 * eram as únicas no padrão, e são as do caminho crítico do balcão. Sem este
 * teste, remover o segundo argumento volta a compilar e volta a passar.
 */

/** Rascunho mínimo que `serializeQuote` aceita. */
function rascunhoFalso(id = 'q1') {
  const agora = new Date('2026-09-20T12:00:00Z');
  return {
    id,
    status: 'DRAFT',
    customerName: null,
    customerPhone: null,
    paymentMethod: null,
    machineModel: null,
    notes: null,
    discountPercentage: 0,
    totalItems: 0,
    grossTotal: 0,
    discountAmount: 0,
    netTotal: 0,
    createdAt: agora,
    updatedAt: agora,
    savedAt: null,
    user: { id: 'u1', email: 'balcao@loja.local' },
    items: [],
  };
}

/**
 * Troca `$transaction` por um espião e devolve o que foi capturado + como
 * restaurar. O `callback` recebe um `tx` falso: o que interessa aqui é o
 * SEGUNDO argumento, não o corpo da transação.
 */
function espiaTransacao() {
  const alvo = prisma as unknown as Record<string, unknown>;
  const original = alvo.$transaction;
  const capturado: { opcoes?: unknown } = {};

  const txFalso = {
    quoteItem: { deleteMany: async () => ({ count: 0 }), createMany: async () => ({ count: 0 }) },
    quote: { update: async () => rascunhoFalso() },
  };

  alvo.$transaction = async (callback: (tx: unknown) => unknown, opcoes?: unknown) => {
    capturado.opcoes = opcoes;
    return callback(txFalso);
  };

  return { capturado, restaurar: () => { alvo.$transaction = original; } };
}

/** `getOrCreateDraft` consulta antes da transação; devolve um rascunho pronto. */
function comRascunhoExistente() {
  const alvo = prisma.quote as unknown as Record<string, unknown>;
  const original = alvo.findFirst;
  alvo.findFirst = async () => rascunhoFalso();
  return () => { alvo.findFirst = original; };
}

test('a constante declara um teto maior que o pior tempo já observado', () => {
  // 6725 ms é o tempo real que estourou a janela padrão. O teto tem que ficar
  // acima dele com folga, senão a correção não corrige nada.
  assert.ok(QUOTE_TX_OPTIONS.timeout > 6725, `timeout = ${QUOTE_TX_OPTIONS.timeout}`);
  assert.ok(QUOTE_TX_OPTIONS.timeout >= 15_000, 'folga pequena demais para o plano free');
  // `maxWait` é a espera por conexão do pool, e o padrão (2 s) é apertado pelo
  // mesmo motivo que o outro.
  assert.ok(QUOTE_TX_OPTIONS.maxWait > 2_000, `maxWait = ${QUOTE_TX_OPTIONS.maxWait}`);
});

test('replaceDraft passa o teto explícito para o Prisma', async () => {
  const restaurarQuote = comRascunhoExistente();
  const { capturado, restaurar } = espiaTransacao();
  try {
    await QuoteService.replaceDraft('t1', 'u1', [], {});
    assert.deepEqual(
      capturado.opcoes,
      { maxWait: QUOTE_TX_OPTIONS.maxWait, timeout: QUOTE_TX_OPTIONS.timeout },
      'a transação da cesta voltou para a janela padrão de 5 s',
    );
  } finally {
    restaurar();
    restaurarQuote();
  }
});

test('clearDraft herda o mesmo teto (passa pelo replaceDraft)', async () => {
  const restaurarQuote = comRascunhoExistente();
  const { capturado, restaurar } = espiaTransacao();
  try {
    await QuoteService.clearDraft('t1', 'u1');
    assert.ok(capturado.opcoes, 'esvaziar a cesta ficou sem teto');
  } finally {
    restaurar();
    restaurarQuote();
  }
});
