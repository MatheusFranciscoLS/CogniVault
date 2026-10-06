import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { authMiddleware, invalidateUserAuthCache, type AuthenticatedRequest } from './auth.middleware';
import {
  planSessionRenewal,
  SESSION_ABSOLUTE_MAX_SECONDS,
  SESSION_RENEW_WHEN_LEFT_SECONDS,
} from '../utils/session-renewal';
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../utils/session-cookie';

/**
 * Renovação da sessão: o caso feliz importa, mas numa mudança de segurança importa
 * MAIS o que NÃO pode renovar — passou do teto, veio por header, sessão já
 * invalidada. Cada um desses tem teste próprio.
 *
 * Como o teto de 12 h conta do login ORIGINAL, toda renovação (só acontece depois da
 * hora 4) é cortada nele: o token novo termina sempre em `login + 12 h`. Uma primeira
 * versão destes testes esperava "mais 8 h" e reprovou: o código estava certo e o
 * teste (e o comentário) errados.
 *
 * Nenhum teste toca banco: `prisma.user.findUnique` é trocado por um stub.
 */

const H = 3600;
const SECRET = 'segredo-so-de-teste-da-renovacao';

// ---------- função pura ----------

const agora = 1_800_000_000;

function claims(idadeH: number, ttlH = 8, extra: Record<string, unknown> = {}) {
  const iat = agora - Math.round(idadeH * H);
  return { iat, exp: iat + Math.round(ttlH * H), ...extra };
}

test('sobra bastante vida: não renova', () => {
  assert.equal(planSessionRenewal(claims(1), agora), null);
  // Exatamente no limiar (restam 4 h) ainda não renova.
  assert.equal(planSessionRenewal(claims(4), agora), null);
});

test('a renovação leva a sessão ao TETO de 12 h desde o login, e preserva o login original', () => {
  for (const idadeH of [4.1, 5, 7, 7.9]) {
    const plan = planSessionRenewal(claims(idadeH), agora);
    assert.ok(plan, `idade ${idadeH} h`);
    assert.equal(plan.authAt, agora - Math.round(idadeH * H), `idade ${idadeH} h`);
    assert.equal(
      plan.expiresInSeconds,
      SESSION_ABSOLUTE_MAX_SECONDS - Math.round(idadeH * H),
      `idade ${idadeH} h: tem que terminar exatamente no teto`,
    );
  }
});

test('depois de renovada, a sessão não renova de novo: já está no teto', () => {
  // Token renovado: exp = login + 12 h. Na hora 9 restam 3 h (< 4 h), mas o teto é o
  // próprio exp, então não há o que ganhar.
  const renovado = { iat: agora - 1 * H, authAt: agora - 9 * H, exp: agora - 9 * H + 12 * H };
  assert.equal(planSessionRenewal(renovado, agora), null);
});

test('no teto não renova: não há o que ganhar', () => {
  // Login há 11,5 h com token de 12 h: o teto cai exatamente onde o token já cai.
  assert.equal(planSessionRenewal(claims(11.5, 12), agora), null);
  // Quase no teto.
  assert.equal(planSessionRenewal(claims(11.9, 12), agora), null);
});

test('authAt explícito vale mais que iat: o teto conta do login ORIGINAL', () => {
  // Login original há 10 h (authAt), token reemitido há 5 h. Teto = daqui a 2 h; o
  // token atual já vai até daqui a 3 h: nada a ganhar.
  assert.equal(planSessionRenewal(claims(5, 8, { authAt: agora - 10 * H }), agora), null);
});

test('claims faltando ou absurdas nunca renovam', () => {
  assert.equal(planSessionRenewal({}, agora), null);
  assert.equal(planSessionRenewal({ exp: agora + H }, agora), null, 'sem iat/authAt não há como aplicar o teto');
  assert.equal(planSessionRenewal({ iat: agora - H }, agora), null, 'sem exp');
  assert.equal(planSessionRenewal({ iat: 'ontem', exp: 'amanhã' }, agora), null);
  assert.equal(planSessionRenewal({ iat: agora + 10 * H, exp: agora + H }, agora), null, 'login do futuro');
  assert.equal(planSessionRenewal({ iat: Number.NaN, exp: agora + H }, agora), null);
});

// ---------- middleware de verdade ----------

function token(opts: {
  idadeH: number;
  ttlH?: number;
  authAt?: number;
  sessionVersion?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const iat = now - Math.round(opts.idadeH * H);
  return jwt.sign(
    {
      id: 'u1',
      role: 'MECHANIC',
      tenantId: 't1',
      sessionVersion: opts.sessionVersion ?? 0,
      iat,
      ...(opts.authAt !== undefined ? { authAt: opts.authAt } : {}),
    },
    SECRET,
    { algorithm: 'HS256', expiresIn: Math.round((opts.ttlH ?? 8) * H) },
  );
}

async function comServidor<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const anteriorSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  invalidateUserAuthCache();

  const alvo = prisma.user as unknown as Record<string, unknown>;
  const originalFind = alvo.findUnique;
  alvo.findUnique = async () => ({
    id: 'u1',
    email: 'balcao@loja.local',
    tenantId: 't1',
    role: 'MECHANIC',
    status: 'APPROVED',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    sessionVersion: 0,
    tenant: { name: 'Loja' },
  });

  const app = express();
  // O CodeQL (js/missing-rate-limiting) acusa rota que autoriza sem limitador, e
  // reprovou o PR por causa deste servidor de teste. Ele não existe em produção, mas o
  // limitador custa uma linha e tira o falso positivo do caminho. Teto folgado: os
  // testes fazem poucas chamadas e não podem esbarrar nele.
  const limitador = rateLimit({ windowMs: 60_000, limit: 10_000, validate: false });
  app.get('/ping', limitador, authMiddleware, (req: AuthenticatedRequest, res) => {
    res.json({ ok: true, user: req.user?.id });
  });
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    alvo.findUnique = originalFind;
    invalidateUserAuthCache();
    if (anteriorSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = anteriorSecret;
  }
}

const comCookie = (t: string) => ({ headers: { Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(t)}` } });

function tokenDoSetCookie(res: Response): string | null {
  const header = res.headers.get('set-cookie');
  if (!header) return null;
  const match = header.match(new RegExp(`^${SESSION_COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function maxAgeDoCookie(res: Response): number {
  return Number((res.headers.get('set-cookie') || '').match(/Max-Age=(\d+)/)?.[1]);
}

test('sessão recém-aberta não ganha Set-Cookie', async () => {
  await comServidor(async base => {
    const res = await fetch(`${base}/ping`, comCookie(token({ idadeH: 1 })));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('set-cookie'), null);
  });
});

test('na segunda metade da vida o cookie é renovado até o teto, com o mesmo usuário', async () => {
  await comServidor(async base => {
    const original = token({ idadeH: 5 });
    const res = await fetch(`${base}/ping`, comCookie(original));
    assert.equal(res.status, 200);

    const novo = tokenDoSetCookie(res);
    assert.ok(novo, 'deveria ter renovado');
    const decoded = jwt.verify(novo, SECRET, { algorithms: ['HS256'] }) as Record<string, number | string>;
    const agoraS = Math.floor(Date.now() / 1000);
    assert.equal(decoded.id, 'u1');
    assert.equal(decoded.role, 'MECHANIC');
    assert.equal(decoded.tenantId, 't1');
    assert.equal(decoded.sessionVersion, 0);

    // O login original sobrevive: é isso que impede a sessão de ser eterna.
    const authAtOriginal = (jwt.decode(original) as { iat: number }).iat;
    assert.equal(decoded.authAt, authAtOriginal);
    // Vale exatamente até o teto: login + 12 h, que aqui é daqui a ~7 h.
    assert.equal(Number(decoded.exp), authAtOriginal + SESSION_ABSOLUTE_MAX_SECONDS);
    assert.ok(Math.abs(Number(decoded.exp) - (agoraS + 7 * H)) <= 5, 'restam ~7 h');

    // O cookie acompanha o token e mantém os atributos de segurança do login.
    assert.ok(Math.abs(maxAgeDoCookie(res) - 7 * H) <= 5, `Max-Age = ${maxAgeDoCookie(res)}`);
    assert.match(res.headers.get('set-cookie') || '', /HttpOnly/);
    assert.match(res.headers.get('set-cookie') || '', /SameSite=Lax/);

    // E o token novo funciona de verdade.
    const seguinte = await fetch(`${base}/ping`, comCookie(novo));
    assert.equal(seguinte.status, 200);
  });
});

test('o Max-Age do cookie nunca passa da vida do token que ele carrega', async () => {
  await comServidor(async base => {
    // Login há 7 h: restam 5 h até o teto. O cookie novo tem que expirar junto, e não
    // em 8 h (que sobreviveria ao token e deixaria um cookie "morto" no navegador).
    const res = await fetch(`${base}/ping`, comCookie(token({ idadeH: 7 })));
    const novo = tokenDoSetCookie(res);
    assert.ok(novo);
    const decoded = jwt.decode(novo) as { exp: number; authAt: number };
    assert.ok(decoded.exp <= decoded.authAt + SESSION_ABSOLUTE_MAX_SECONDS);
    assert.ok(Math.abs(maxAgeDoCookie(res) - 5 * H) <= 5, `Max-Age = ${maxAgeDoCookie(res)}`);
    assert.ok(maxAgeDoCookie(res) < SESSION_TTL_SECONDS);
  });
});

test('no teto absoluto a sessão NÃO se renova', async () => {
  await comServidor(async base => {
    const res = await fetch(`${base}/ping`, comCookie(token({ idadeH: 11.5, ttlH: 12 })));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('set-cookie'), null);
  });
});

test('o login original manda: token reemitido há pouco, mas login de 10 h atrás, não renova', async () => {
  await comServidor(async base => {
    const authAtAntigo = Math.floor(Date.now() / 1000) - 10 * H;
    const res = await fetch(`${base}/ping`, comCookie(token({ idadeH: 5, authAt: authAtAntigo })));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('set-cookie'), null);
  });
});

test('token por Authorization: Bearer não renova (é cliente de API)', async () => {
  await comServidor(async base => {
    const res = await fetch(`${base}/ping`, { headers: { Authorization: `Bearer ${token({ idadeH: 5 })}` } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('set-cookie'), null);
  });
});

test('sessão invalidada (logout) continua 401 e NUNCA ganha cookie novo', async () => {
  await comServidor(async base => {
    // O stub do usuário tem sessionVersion 0; o token carrega 7, como se o usuário
    // tivesse feito logout depois de emiti-lo.
    const res = await fetch(`${base}/ping`, comCookie(token({ idadeH: 5, sessionVersion: 7 })));
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('set-cookie'), null);
  });
});

test('token expirado ou adulterado continua 401 e sem cookie', async () => {
  await comServidor(async base => {
    const expirado = await fetch(`${base}/ping`, comCookie(token({ idadeH: 9, ttlH: 8 })));
    assert.equal(expirado.status, 401);
    assert.equal(expirado.headers.get('set-cookie'), null);

    const adulterado = token({ idadeH: 5 }).replace(/.$/, c => (c === 'A' ? 'B' : 'A'));
    const res = await fetch(`${base}/ping`, comCookie(adulterado));
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('set-cookie'), null);
  });
});

test('os números são os documentados: 4 h de limiar, 8 h de janela, 12 h de teto', () => {
  // Trava os números: mudá-los é decisão de segurança, não de refatoração.
  assert.equal(SESSION_RENEW_WHEN_LEFT_SECONDS, 4 * H);
  assert.equal(SESSION_ABSOLUTE_MAX_SECONDS, 12 * H);
  assert.equal(SESSION_TTL_SECONDS, 8 * H);
});
