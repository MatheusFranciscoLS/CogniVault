import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedCorsOrigins, isAllowedCorsOrigin } from './cors';

test('allows production, main and local CogniVault origins', () => {
  const origins = allowedCorsOrigins();
  assert.equal(isAllowedCorsOrigin('https://cognivault-murex.vercel.app', origins), true);
  assert.equal(isAllowedCorsOrigin('https://cognivault-git-main-matheus-projects-50653618.vercel.app/', origins), true);
  assert.equal(isAllowedCorsOrigin('http://localhost:5173', origins), true);
});

test('accepts explicitly configured origins and normalizes trailing slashes', () => {
  const origins = allowedCorsOrigins('https://pecas.vardao.com.br/, https://intranet.vardao.com.br');
  assert.equal(isAllowedCorsOrigin('https://pecas.vardao.com.br', origins), true);
  assert.equal(isAllowedCorsOrigin('https://intranet.vardao.com.br/', origins), true);
});

test('rejects arbitrary Vercel projects and hostname suffix spoofing', () => {
  const origins = allowedCorsOrigins();
  assert.equal(isAllowedCorsOrigin('https://cognivault-attacker.vercel.app', origins), false);
  assert.equal(isAllowedCorsOrigin('https://cognivault-murex.vercel.app.example.com', origins), false);
});
