import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { clearSessionCookie, readSessionCookie, SESSION_COOKIE_NAME, setSessionCookie } from './session-cookie';

function responseRecorder() {
  let cookie = '';
  return {
    response: {
      setHeader(name: string, value: string) {
        if (name.toLowerCase() === 'set-cookie') cookie = value;
      },
    } as unknown as Response,
    value: () => cookie,
  };
}

test('lê somente o cookie de sessão esperado', () => {
  const req = { headers: { cookie: `other=x; ${SESSION_COOKIE_NAME}=abc.def.ghi; theme=dark` } } as unknown as Request;
  assert.equal(readSessionCookie(req), 'abc.def.ghi');
});

test('cookie de sessão é HttpOnly, SameSite=Lax e limitado ao path raiz', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const recorder = responseRecorder();
  setSessionCookie(recorder.response, 'token-value');
  const cookie = recorder.value();
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE_NAME}=token-value;`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=28800/);
  assert.doesNotMatch(cookie, /Secure/);
  process.env.NODE_ENV = previous;
});

test('produção marca o cookie como Secure e logout expira imediatamente', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const login = responseRecorder();
  setSessionCookie(login.response, 'secure-token');
  assert.match(login.value(), /Secure/);

  const logout = responseRecorder();
  clearSessionCookie(logout.response);
  assert.match(logout.value(), /Max-Age=0/);
  assert.match(logout.value(), /HttpOnly/);
  assert.match(logout.value(), /Secure/);
  process.env.NODE_ENV = previous;
});
