import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { NextFunction, Request, Response } from 'express';

const MAX_SAMPLES_PER_ROUTE = 240;
const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS || '500');

type RouteStats = {
  samples: number[];
  requests: number;
  errors: number;
  lastMs: number;
  maxMs: number;
  lastStatus: number;
  cacheHits: number;
  cacheMisses: number;
  cacheStales: number;
  updatedAt: string;
};

const stats = new Map<string, RouteStats>();

/**
 * Mantém nomes de rotas estáticas legíveis nas métricas e anonimiza apenas
 * identificadores dinâmicos. Antes, qualquer segmento longo (ex.: notifications,
 * documents, performance) virava `:key`, o que escondia qual endpoint estava lento.
 */
export function metricPath(path: string): string {
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/(?:\d{6,}|(?=[A-Za-z0-9_-]{7,}(?=\/|$))(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+)(?=\/|$)/g, '/:key');
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function requestId(req: Request): string {
  const received = String(req.header('x-request-id') || '').trim();
  if (/^[A-Za-z0-9._:-]{1,100}$/.test(received)) return received;
  return randomUUID();
}

export function requestPerformanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/health')) {
    next();
    return;
  }

  const correlationId = requestId(req);
  res.set('X-Request-Id', correlationId);

  const started = performance.now();
  res.once('finish', () => {
    const durationMs = performance.now() - started;
    const key = `${req.method} ${metricPath(req.path)}`;
    const current: RouteStats = stats.get(key) || {
      samples: [],
      requests: 0,
      errors: 0,
      lastMs: 0,
      maxMs: 0,
      lastStatus: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheStales: 0,
      updatedAt: new Date().toISOString(),
    };

    current.requests += 1;
    if (res.statusCode >= 500) current.errors += 1;
    current.lastMs = durationMs;
    current.maxMs = Math.max(current.maxMs, durationMs);
    current.lastStatus = res.statusCode;
    current.updatedAt = new Date().toISOString();
    current.samples.push(durationMs);
    if (current.samples.length > MAX_SAMPLES_PER_ROUTE) current.samples.shift();

    const cacheStatus = String(res.getHeader('X-CogniVault-Cache') || '').toUpperCase();
    if (cacheStatus === 'HIT') current.cacheHits += 1;
    else if (cacheStatus === 'MISS') current.cacheMisses += 1;
    else if (cacheStatus === 'STALE') current.cacheStales += 1;

    stats.set(key, current);

    if (durationMs >= SLOW_REQUEST_MS) {
      console.warn(`🐢 Requisição lenta: ${key} · ${rounded(durationMs)} ms · HTTP ${res.statusCode} · id=${correlationId}`);
    }
  });

  next();
}

export function performanceSnapshot() {
  const routes = [...stats.entries()].map(([route, item]) => {
    const total = item.samples.reduce((sum, value) => sum + value, 0);
    const cacheRequests = item.cacheHits + item.cacheMisses + item.cacheStales;
    return {
      route,
      requests: item.requests,
      samples: item.samples.length,
      avgMs: rounded(item.samples.length ? total / item.samples.length : 0),
      p95Ms: rounded(percentile(item.samples, 0.95)),
      maxMs: rounded(item.maxMs),
      lastMs: rounded(item.lastMs),
      errors: item.errors,
      errorRate: item.requests ? rounded((item.errors / item.requests) * 100) : 0,
      cacheHits: item.cacheHits,
      cacheMisses: item.cacheMisses,
      cacheStales: item.cacheStales,
      cacheHitRate: cacheRequests ? rounded((item.cacheHits / cacheRequests) * 100) : null,
      lastStatus: item.lastStatus,
      updatedAt: item.updatedAt,
    };
  });

  routes.sort((a, b) => b.p95Ms - a.p95Ms || b.requests - a.requests);

  const memory = process.memoryUsage();
  const eventLoop = performance.eventLoopUtilization();

  return {
    generatedAt: new Date().toISOString(),
    slowThresholdMs: SLOW_REQUEST_MS,
    runtime: {
      uptimeSeconds: Math.round(process.uptime()),
      rssMb: rounded(memory.rss / 1024 / 1024),
      heapUsedMb: rounded(memory.heapUsed / 1024 / 1024),
      heapTotalMb: rounded(memory.heapTotal / 1024 / 1024),
      externalMb: rounded(memory.external / 1024 / 1024),
      eventLoopUtilizationPct: rounded(eventLoop.utilization * 100),
    },
    routes,
  };
}
