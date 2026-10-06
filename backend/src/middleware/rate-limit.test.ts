import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { loginLimiter } from './rate-limit.middleware';

/**
 * A trava de login tem que contar quem ERRA, não quem entra.
 *
 * A loja inteira sai por um IP público só (NAT). Contando login bem-sucedido, o
 * teto de 10 era do prédio: o pessoal entra no começo do turno e o próximo
 * atendente fica 15 minutos na porta, com cliente esperando. A sessão dura 8 h
 * e não renova, então todo mundo é deslogado mais ou menos junto e volta junto.
 *
 * O teste sobe um servidor de verdade e bate nele: é o comportamento do
 * middleware que interessa, não a forma do objeto de configuração.
 *
 * Os dois casos usam a MESMA instância do limiter de propósito — é assim em
 * produção. As 15 entradas certas do primeiro teste não podem ter deixado
 * resíduo no contador que o segundo teste usa.
 */

/** Sobe um app com o limiter e uma rota que responde o status pedido. */
async function servidor(status: number) {
  const app = express();
  app.post('/api/login', loginLimiter, (_req, res) => {
    res.status(status).json({ ok: status < 400 });
  });
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    async bater(vezes: number): Promise<number[]> {
      const status: number[] = [];
      for (let i = 0; i < vezes; i++) {
        const resposta = await fetch(`http://127.0.0.1:${port}/api/login`, { method: 'POST' });
        status.push(resposta.status);
      }
      return status;
    },
    fechar: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

test('login que dá certo não gasta a cota do IP', async () => {
  const s = await servidor(200);
  try {
    // 15 > o teto de 10. Antes de `skipSuccessfulRequests`, a 11ª virava 429 —
    // e era exatamente isso que acontecia com o balcão atrás de um NAT.
    const status = await s.bater(15);
    const bloqueadas = status.filter(codigo => codigo === 429);
    assert.equal(
      bloqueadas.length,
      0,
      `entradas corretas foram bloqueadas: ${JSON.stringify(status)}`,
    );
  } finally {
    await s.fechar();
  }
});

test('senha errada continua gastando a cota, e a trava fecha', async () => {
  const s = await servidor(401);
  try {
    const status = await s.bater(15);
    // As 10 primeiras passam pelo limiter (e o app responde 401); da 11ª em
    // diante o limiter responde 429 antes de chegar na rota.
    assert.equal(status.slice(0, 10).every(codigo => codigo === 401), true, JSON.stringify(status));
    assert.equal(status.slice(10).every(codigo => codigo === 429), true, JSON.stringify(status));
  } finally {
    await s.fechar();
  }
});
