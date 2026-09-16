import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { LRUCache } from 'lru-cache';
import { prisma } from '../config/prisma';

type MemoryEntry = { payload: unknown; expiresAt: number };
type DecisionRow = {
  tenantId: string;
  purpose: string;
  payload: Prisma.JsonValue;
  expiresAt: Date;
};

const memory = new LRUCache<string, MemoryEntry>({ max: 1000, ttl: 24 * 60 * 60 * 1000 });
let lastCleanupAt = 0;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = canonicalize((value as Record<string, unknown>)[key]);
    return acc;
  }, {});
}

function keyFor(tenantId: string, purpose: string, identity: unknown): string {
  const digest = createHash('sha256')
    .update(JSON.stringify(canonicalize({ tenantId, purpose, identity })))
    .digest('hex');
  return `${purpose}:${digest}`;
}

function unwrap<T>(payload: Prisma.JsonValue): T | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return ((payload as Record<string, Prisma.JsonValue>).value ?? null) as T | null;
}

async function cleanupExpired(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < 60 * 60 * 1000) return;
  lastCleanupAt = now;
  await prisma.$executeRaw`DELETE FROM "AiDecisionCache" WHERE "expiresAt" < NOW()`
    .catch(() => undefined);
}

/**
 * Cache auxiliar de decisões generativas. A tabela é propositalmente acessada
 * por SQL parametrizado para não acoplar o domínio Prisma a um detalhe interno
 * de economia de tokens. A migration continua sendo a fonte do schema da tabela.
 */
export class AiDecisionCacheService {
  static async get<T>(tenantId: string, purpose: string, identity: unknown): Promise<T | null> {
    const key = keyFor(tenantId, purpose, identity);
    const now = Date.now();
    const local = memory.get(key);
    if (local && local.expiresAt > now) return local.payload as T;

    const rows = await prisma.$queryRaw<DecisionRow[]>`
      SELECT "tenantId", "purpose", "payload", "expiresAt"
      FROM "AiDecisionCache"
      WHERE "key" = ${key}
      LIMIT 1
    `.catch(() => [] as DecisionRow[]);
    const row = rows[0];
    if (!row || row.tenantId !== tenantId || row.purpose !== purpose || row.expiresAt.getTime() <= now) {
      if (row?.expiresAt && row.expiresAt.getTime() <= now) {
        void prisma.$executeRaw`DELETE FROM "AiDecisionCache" WHERE "key" = ${key}`.catch(() => undefined);
      }
      return null;
    }

    const value = unwrap<T>(row.payload);
    if (value !== null) memory.set(key, { payload: value, expiresAt: row.expiresAt.getTime() });
    return value;
  }

  static async set<T>(tenantId: string, purpose: string, identity: unknown, value: T, ttlMs: number): Promise<void> {
    const key = keyFor(tenantId, purpose, identity);
    const expiresAt = new Date(Date.now() + Math.max(60_000, ttlMs));
    const payloadJson = JSON.stringify({ value });
    memory.set(key, { payload: value, expiresAt: expiresAt.getTime() });

    await prisma.$executeRaw`
      INSERT INTO "AiDecisionCache" ("key", "tenantId", "purpose", "payload", "expiresAt", "createdAt", "updatedAt")
      VALUES (${key}, ${tenantId}, ${purpose}, ${payloadJson}::jsonb, ${expiresAt}, NOW(), NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "tenantId" = EXCLUDED."tenantId",
        "purpose" = EXCLUDED."purpose",
        "payload" = EXCLUDED."payload",
        "expiresAt" = EXCLUDED."expiresAt",
        "updatedAt" = NOW()
    `.catch(error => {
      console.warn('[AI Cache] Não foi possível persistir decisão reutilizável:', error instanceof Error ? error.message : error);
      return 0;
    });
    void cleanupExpired();
  }

  static async invalidateTenant(tenantId: string): Promise<void> {
    // Chaves em memória são hashes por privacidade. Limpar o pequeno LRU inteiro
    // é conservador e evita tentar inferir tenant a partir do hash.
    memory.clear();
    await prisma.$executeRaw`DELETE FROM "AiDecisionCache" WHERE "tenantId" = ${tenantId}`;
  }
}
