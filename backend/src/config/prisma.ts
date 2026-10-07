import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
    prisma?: PrismaClient;
};

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Teto padrão das transações interativas. O padrão do Prisma é 5 s, e em
 * 2026-09-18 ele derrubou a cesta em produção (6,7 s) por latência de rede entre
 * Render free e Supabase free, não por trabalho pesado. Oito transações do
 * backend ainda usavam o padrão; transação que declara o próprio teto continua
 * valendo o que declarou.
 */
export const PRISMA_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: ['error', 'warn'],
    transactionOptions: PRISMA_TRANSACTION_OPTIONS,
});

if (isDevelopment) {
    globalForPrisma.prisma = prisma;
}
