import { NextFunction, Request, Response } from 'express';
import { performance } from 'node:perf_hooks';

const MAX_SAMPLES_PER_ROUTE = 240;
const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS || '500');

type RouteStats = {
  samples: number[];
  requests: number;
  errors: number;
  lastMs: number;
  maxMs: number;
  lastStatus: number;
  updatedAt: string;
};

const stats = new Map<string, RouteStats>();

function metricPath(path: string): string {
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/[A-Za-z0-9_-]{7,}(?=\/|$)/g, '/:key');
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

export function requestPerformanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/health')) {
    next();
    return;
  }

  const started = performance.now();
  res.once('finish', () => {
    const durationMs = performance.now() - started;
    const key = `${req.method} ${metricPath(req.path)}`;
    const current = stats.get(key) || {
      samples: [], requests: 0, errors: 0, lastMs: 0, maxMs: 0, lastStatus: 0, updatedAt: new Date().toISOString(),
    };

    current.requests += 1;
    if (res.statusCode >= 500) current.errors += 1;
    current.lastMs = durationMs;
    current.maxMs = Math.max(current.maxMs, durationMs);
    current.lastStatus = res.statusCode;
    current.updatedAt = new Date().toISOString();
    current.samples.push(durationMs);
    if (current.samples.length > MAX_SAMPLES_PER_ROUTE) current.samples.shift();
    stats.set(key, current);

    if (durationMs >= SLOW_REQUEST_MS) {
      console.warn(`🐢 Requisição lenta: ${key} · ${rounded(durationMs)} ms · HTTP ${res.statusCode}`);
    }
  });

  next();
}

export function performanceSnapshot() {
  const routes = [...stats.entries()].map(([route, item]) => {
    const total = item.samples.reduce((sum, value) => sum + value, 0);
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
      lastStatus: item.lastStatus,
      updatedAt: item.updatedAt,
    };
  });

  routes.sort((a, b) => b.p95Ms - a.p95Ms || b.requests - a.requests);
  return {
    generatedAt: new Date().toISOString(),
    slowThresholdMs: SLOW_REQUEST_MS,
    routes,
  };
}
