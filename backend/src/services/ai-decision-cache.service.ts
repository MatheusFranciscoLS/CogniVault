import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { LRUCache } from 'lru-cache';
import { prisma } from '../config/prisma';

type MemoryEntry = { payload: unknown; expiresAt: number };

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

function envelope<T>(value: T): Prisma.InputJsonValue {
  return { value: value as Prisma.InputJsonValue };
}

function unwrap<T>(payload: Prisma.JsonValue): T | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return ((payload as Record<string, Prisma.JsonValue>).value ?? null) as T | null;
}

async function cleanupExpired(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < 60 * 60 * 1000) return;
  lastCleanupAt = now;
  await prisma.aiDecisionCache.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }).catch(() => undefined);
}

export class AiDecisionCacheService {
  static async get<T>(tenantId: string, purpose: string, identity: unknown): Promise<T | null> {
    const key = keyFor(tenantId, purpose, identity);
    const now = Date.now();
    const local = memory.get(key);
    if (local && local.expiresAt > now) return local.payload as T;

    const row = await prisma.aiDecisionCache.findUnique({ where: { key } }).catch(() => null);
    if (!row || row.tenantId !== tenantId || row.purpose !== purpose || row.expiresAt.getTime() <= now) {
      if (row?.expiresAt && row.expiresAt.getTime() <= now) {
        void prisma.aiDecisionCache.deleteMany({ where: { key } }).catch(() => undefined);
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
    memory.set(key, { payload: value, expiresAt: expiresAt.getTime() });

    await prisma.aiDecisionCache.upsert({
      where: { key },
      create: { key, tenantId, purpose, payload: envelope(value), expiresAt },
      update: { tenantId, purpose, payload: envelope(value), expiresAt },
    }).catch(error => {
      console.warn('[AI Cache] Não foi possível persistir decisão reutilizável:', error instanceof Error ? error.message : error);
    });
    void cleanupExpired();
  }

  static async invalidateTenant(tenantId: string): Promise<void> {
    for (const [key] of memory.entries()) {
      if (key.includes(':')) memory.delete(key);
    }
    await prisma.aiDecisionCache.deleteMany({ where: { tenantId } });
  }
}
