import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PRISMA_TRANSACTION_OPTIONS } from './prisma';

test('o teto padrão das transações cobre a latência que derrubou a cesta (6,7 s)', () => {
  assert.ok(PRISMA_TRANSACTION_OPTIONS.timeout > 6725, `timeout = ${PRISMA_TRANSACTION_OPTIONS.timeout}`);
  assert.ok(PRISMA_TRANSACTION_OPTIONS.timeout >= 15_000, 'folga pequena demais para o plano free');
  assert.ok(PRISMA_TRANSACTION_OPTIONS.maxWait > 2_000, `maxWait = ${PRISMA_TRANSACTION_OPTIONS.maxWait}`);
});

test('o cliente Prisma é criado COM esse teto (não só a constante existe)', () => {
  // Texto do fonte, de propósito: instanciar o cliente aqui abriria conexão com o
  // banco do ambiente. Se alguém tirar a opção do construtor, este teste reprova.
  const source = readFileSync(path.join(__dirname, '..', '..', 'src', 'config', 'prisma.ts'), 'utf8');
  assert.match(source, /new PrismaClient\(\{[^}]*transactionOptions:\s*PRISMA_TRANSACTION_OPTIONS/s);
});
