import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import routes from './routes';
import { prisma } from './config/prisma';
import { rabbitMQ } from './queues/connection';

const app = express();

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timeout ao consultar o banco.')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

function isAllowedVercelOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      url.protocol === 'https:' &&
      /^cognivault(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    // Requests sem Origin (health checks, server-to-server) continuam permitidas.
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/$/, '');
    if (
      allowedOrigins.includes(normalizedOrigin) ||
      isAllowedVercelOrigin(normalizedOrigin)
    ) {
      return callback(null, true);
    }

    return callback(new HttpError(403, 'Origem não permitida pelo CORS.'));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '2mb' }));

app.use('/api', routes);

app.get('/health/live', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ status: 'online' });
});

app.get('/health', async (_req, res) => {
  let databaseReady = false;
  let databaseError: string | null = null;

  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 3_000);
    databaseReady = true;
  } catch (error) {
    databaseError = error instanceof Error ? error.message : 'Falha desconhecida no banco.';
    console.error('❌ Health check do PostgreSQL falhou:', databaseError);
  }

  const queue = rabbitMQ.health();
  const ready = databaseReady && queue.ready;

  res
    .status(ready ? 200 : 503)
    .set('Cache-Control', 'no-store')
    .json({
      status: ready ? 'online' : 'degraded',
      checks: {
        database: { ready: databaseReady },
        queue: { ready: queue.ready },
      },
      uptimeSeconds: Math.round(process.uptime()),
    });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const isUploadError = error instanceof multer.MulterError;
  const status = error instanceof HttpError ? error.status : isUploadError && error.code === 'LIMIT_FILE_SIZE' ? 413 : isUploadError ? 400 : 500;
  const message = error instanceof HttpError
    ? error.message
    : isUploadError && error.code === 'LIMIT_FILE_SIZE'
      ? 'O PDF excede o limite de 50 MB.'
      : isUploadError
        ? 'Não foi possível receber o arquivo enviado.'
        : 'Erro interno do servidor.';

  if (status >= 500) console.error('❌ Erro não tratado na API:', error);
  res.status(status).json({ error: message });
});

export default app;
