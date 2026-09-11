import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { normalizeText } from '../utils/normalize';

type SharedJsonResponse = {
  statusCode: number;
  body: unknown;
};

type Flight = {
  promise: Promise<SharedJsonResponse>;
  resolve: (value: SharedJsonResponse) => void;
  reject: (reason?: unknown) => void;
};

const flights = new Map<string, Flight>();

function flightKey(req: AuthenticatedRequest): string | null {
  if (!req.user) return null;
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return null;
  return `${req.user.tenantId}:${normalizeText(q)}`;
}

/**
 * Só entra depois do FastSearchController. Portanto cobre o caminho lexical/semântico
 * mais caro e evita que duas pessoas disparem a mesma consulta fria ao mesmo tempo.
 */
export function searchSingleFlightMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const key = flightKey(req);
  if (!key) {
    next();
    return;
  }

  const existing = flights.get(key);
  if (existing) {
    res.set('X-CogniVault-Singleflight', 'SHARED');
    existing.promise
      .then(({ statusCode, body }) => {
        if (res.headersSent) return;
        res.status(statusCode).json(body);
      })
      .catch(() => {
        if (!res.headersSent) next();
      });
    return;
  }

  let resolveFlight!: (value: SharedJsonResponse) => void;
  let rejectFlight!: (reason?: unknown) => void;
  const promise = new Promise<SharedJsonResponse>((resolve, reject) => {
    resolveFlight = resolve;
    rejectFlight = reject;
  });

  const flight: Flight = { promise, resolve: resolveFlight, reject: rejectFlight };
  flights.set(key, flight);
  res.set('X-CogniVault-Singleflight', 'OWNER');

  const originalJson = res.json.bind(res);
  let settled = false;

  res.json = ((body: unknown) => {
    if (!settled) {
      settled = true;
      flight.resolve({ statusCode: res.statusCode, body });
    }
    return originalJson(body);
  }) as Response['json'];

  const cleanup = () => {
    if (flights.get(key) === flight) flights.delete(key);
    if (!settled) {
      settled = true;
      flight.reject(new Error('Busca terminou sem resposta JSON compartilhável.'));
    }
  };

  res.once('finish', cleanup);
  res.once('close', cleanup);
  next();
}
