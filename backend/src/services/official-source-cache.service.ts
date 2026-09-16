import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

type CacheOptions = {
  source: string;
  resourceType: string;
  resourceId: string;
  freshMs?: number;
  staleMs?: number;
};

export type OfficialSourceCacheState = 'HIT' | 'STALE' | 'MISS' | 'FALLBACK';

export type OfficialSourceCacheResult<T> = {
  value: T | null;
  state: OfficialSourceCacheState;
  fetchedAt: Date | null;
  changedAt: Date | null;
};

const inflight = new Map<string, Promise<OfficialSourceCacheResult<unknown>>>();

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultFreshMs(): number {
  return envNumber('HUSQVARNA_CACHE_FRESH_MINUTES', 180) * 60 * 1000;
}

function defaultStaleMs(): number {
  return envNumber('HUSQVARNA_CACHE_STALE_DAYS', 7) * 24 * 60 * 60 * 1000;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  return Object.keys(object)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = canonicalize(object[key]);
      return acc;
    }, {});
}

function fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function envelope<T>(value: T): Prisma.InputJsonValue {
  return { value: value as Prisma.InputJsonValue };
}

function unwrap<T>(payload: Prisma.JsonValue): T | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const value = (payload as Record<string, Prisma.JsonValue>)['value'];
  return (value ?? null) as T | null;
}

export function buildOfficialSourceCacheKey(source: string, resourceType: string, identity: unknown): string {
  const suffix = createHash('sha256')
    .update(JSON.stringify(canonicalize(identity)))
    .digest('hex')
    .slice(0, 32);
  return `${source}:${resourceType}:${suffix}`;
}

async function refresh<T>(
  key: string,
  options: CacheOptions,
  loader: () => Promise<T | null>,
): Promise<OfficialSourceCacheResult<T>> {
  const existing = await prisma.officialSourceCache.findUnique({ where: { key } });
  const loaded = await loader();

  // Falha/ausência temporária da fonte não deve apagar uma resposta oficial
  // válida que já estava em cache.
  if (loaded == null && existing) {
    return {
      value: unwrap<T>(existing.payload),
      state: 'FALLBACK',
      fetchedAt: existing.fetchedAt,
      changedAt: existing.changedAt,
    };
  }

  if (loaded == null) {
    return { value: null, state: 'MISS', fetchedAt: null, changedAt: null };
  }

  const now = new Date();
  const nextFingerprint = fingerprint(loaded);
  const changed = Boolean(existing && existing.fingerprint !== nextFingerprint);
  const freshMs = options.freshMs ?? defaultFreshMs();
  const staleMs = Math.max(options.staleMs ?? defaultStaleMs(), freshMs);
  const freshUntil = new Date(now.getTime() + freshMs);
  const staleUntil = new Date(now.getTime() + staleMs);

  const saved = await prisma.officialSourceCache.upsert({
    where: { key },
    create: {
      key,
      source: options.source,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      payload: envelope(loaded),
      fingerprint: nextFingerprint,
      fetchedAt: now,
      freshUntil,
      staleUntil,
      changedAt: null,
    },
    update: {
      source: options.source,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      payload: envelope(loaded),
      previousFingerprint: changed ? existing?.fingerprint : existing?.previousFingerprint,
      fingerprint: nextFingerprint,
      fetchedAt: now,
      freshUntil,
      staleUntil,
      changedAt: changed ? now : existing?.changedAt,
    },
  });

  if (changed) {
    console.info(`[OfficialSourceCache] Mudança detectada em ${options.source}/${options.resourceType}/${options.resourceId}.`);
  }

  return {
    value: loaded,
    state: 'MISS',
    fetchedAt: saved.fetchedAt,
    changedAt: saved.changedAt,
  };
}

export class OfficialSourceCacheService {
  static async get<T>(
    key: string,
    options: CacheOptions,
    loader: () => Promise<T | null>,
  ): Promise<OfficialSourceCacheResult<T>> {
    const now = Date.now();
    const cached = await prisma.officialSourceCache.findUnique({ where: { key } });

    if (cached && cached.freshUntil.getTime() > now) {
      return {
        value: unwrap<T>(cached.payload),
        state: 'HIT',
        fetchedAt: cached.fetchedAt,
        changedAt: cached.changedAt,
      };
    }

    if (cached && cached.staleUntil.getTime() > now) {
      if (!inflight.has(key)) {
        const background = refresh(key, options, loader)
          .catch(error => {
            console.warn(
              `[OfficialSourceCache] Revalidação em segundo plano falhou para ${options.resourceId}:`,
              error instanceof Error ? error.message : error,
            );
            return {
              value: unwrap<T>(cached.payload),
              state: 'FALLBACK' as const,
              fetchedAt: cached.fetchedAt,
              changedAt: cached.changedAt,
            };
          })
          .finally(() => inflight.delete(key));
        inflight.set(key, background as Promise<OfficialSourceCacheResult<unknown>>);
      }

      return {
        value: unwrap<T>(cached.payload),
        state: 'STALE',
        fetchedAt: cached.fetchedAt,
        changedAt: cached.changedAt,
      };
    }

    const existingInflight = inflight.get(key);
    if (existingInflight) return existingInflight as Promise<OfficialSourceCacheResult<T>>;

    const pending = refresh(key, options, loader)
      .catch(error => {
        if (cached) {
          console.warn(
            `[OfficialSourceCache] Fonte indisponível; usando cache expirado para ${options.resourceId}.`,
            error instanceof Error ? error.message : error,
          );
          return {
            value: unwrap<T>(cached.payload),
            state: 'FALLBACK' as const,
            fetchedAt: cached.fetchedAt,
            changedAt: cached.changedAt,
          };
        }
        throw error;
      })
      .finally(() => inflight.delete(key));

    inflight.set(key, pending as Promise<OfficialSourceCacheResult<unknown>>);
    return pending;
  }

  /**
   * Remove uma entrada específica para permitir revalidação forçada e testes
   * isolados. Não apaga dados em massa nem altera a política normal de SWR.
   */
  static async invalidate(key: string): Promise<void> {
    inflight.delete(key);
    await prisma.officialSourceCache.deleteMany({ where: { key } });
  }

  static async recentChanges(limit = 8) {
    return prisma.officialSourceCache.findMany({
      where: { changedAt: { not: null } },
      orderBy: { changedAt: 'desc' },
      take: Math.max(1, Math.min(30, limit)),
      select: {
        key: true,
        source: true,
        resourceType: true,
        resourceId: true,
        changedAt: true,
        fetchedAt: true,
      },
    });
  }
}
