import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeTestDatabase } from './test-database-guard';

/**
 * A guarda existe porque `npm test` rodava contra a produção sem ninguém ver.
 * Os casos de BLOQUEIO são os que importam; os de liberação garantem que ela
 * não atrapalha o CI nem o desenvolvimento local.
 */

test('banco do Supabase (pooler, o formato do .env daqui) é recusado', () => {
  const verdict = judgeTestDatabase('postgresql://postgres.abc:segredo@aws-1-sa-east-1.pooler.supabase.com:6543/postgres');
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /supabase\.com/);
});

test('conexão direta do Supabase também é recusada', () => {
  assert.equal(judgeTestDatabase('postgresql://postgres:x@db.gbhhnxkyxeleaytemrsw.supabase.co:5432/postgres').allowed, false);
});

test('outros provedores hospedados são recusados', () => {
  for (const host of ['dpg-abc.oregon-postgres.render.com', 'ep-cool.us-east-2.aws.neon.tech', 'meu.abc123.sa-east-1.rds.amazonaws.com']) {
    assert.equal(judgeTestDatabase(`postgresql://u:p@${host}:5432/db`).allowed, false, host);
  }
});

test('o banco do CI e o de desenvolvimento local passam', () => {
  // A URL exata do job e2e do CI, mais as variantes comuns.
  for (const host of ['localhost', '127.0.0.1', '[::1]', 'host.docker.internal', 'postgres']) {
    assert.equal(judgeTestDatabase(`postgresql://user:password@${host}:5432/cognivault_e2e`).allowed, true, host);
  }
});

test('host parecido, mas que NÃO é do provedor, não é bloqueado à toa', () => {
  // `endsWith` cru casaria os dois; o ponto separador é o que evita.
  assert.equal(judgeTestDatabase('postgresql://u:p@naosupabase.com:5432/db').allowed, true);
});

test('o domínio do provedor como prefixo de outro domínio não engana', () => {
  // `supabase.com.atacante.net` NÃO é do Supabase — mas também não é local;
  // o que se garante aqui é só que a regra não casa por substring solta.
  assert.equal(judgeTestDatabase('postgresql://u:p@supabase.com.exemplo.net:5432/db').allowed, true);
});

test('maiúsculas no host não escapam da regra', () => {
  assert.equal(judgeTestDatabase('postgresql://u:p@DB.ABC.SUPABASE.CO:5432/db').allowed, false);
});

test('sem DATABASE_URL não há o que proteger', () => {
  assert.equal(judgeTestDatabase(undefined).allowed, true);
  assert.equal(judgeTestDatabase('').allowed, true);
});

test('URL ilegível é recusada, e o valor nunca aparece na mensagem', () => {
  const verdict = judgeTestDatabase('isto nao e uma url com senha=HUNTER2');
  assert.equal(verdict.allowed, false);
  assert.doesNotMatch(verdict.reason, /HUNTER2/);
});

test('a mensagem de recusa nunca carrega usuário, senha nem host completo', () => {
  const verdict = judgeTestDatabase('postgresql://postgres.abc:SENHA_SECRETA@aws-1-sa-east-1.pooler.supabase.com:6543/postgres');
  assert.doesNotMatch(verdict.reason, /SENHA_SECRETA|postgres\.abc|aws-1-sa-east-1/);
});

test('o escape explícito libera, e deixa isso dito na mensagem', () => {
  const verdict = judgeTestDatabase('postgresql://u:p@db.abc.supabase.co:5432/db', true);
  assert.equal(verdict.allowed, true);
  assert.match(verdict.reason, /ALLOW_PRODUCTION_DB_TESTS/);
});
