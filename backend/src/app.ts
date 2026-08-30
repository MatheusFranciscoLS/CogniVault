import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import routes from './routes';
import { prisma } from './config/prisma';
import { allowedCorsOrigins, isAllowedCorsOrigin } from './config/cors';
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

const allowedOrigins = allowedCorsOrigins();

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});

app.use(cors({
  origin(origin, callback) {
    // Requests sem Origin (health checks, server-to-server) continuam permitidas.
    if (!origin) return callback(null, true);

    if (isAllowedCorsOrigin(origin, allowedOrigins)) {
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
  const bodyErrorType = typeof error === 'object' && error !== null && 'type' in error
    ? String(error.type)
    : '';
  const isInvalidJson = error instanceof SyntaxError && bodyErrorType === 'entity.parse.failed';
  const isBodyTooLarge = bodyErrorType === 'entity.too.large';
  const isUploadTooLarge = isUploadError && error.code === 'LIMIT_FILE_SIZE';
  const isPayloadTooLarge = isUploadTooLarge || isBodyTooLarge;
  const status = error instanceof HttpError
    ? error.status
    : isPayloadTooLarge
      ? 413
      : isUploadError || isInvalidJson
        ? 400
        : 500;
  const message = error instanceof HttpError
    ? error.message
    : isPayloadTooLarge
      ? isUploadTooLarge ? 'O PDF excede o limite de 50 MB.' : 'O corpo da requisição excede o limite permitido.'
      : isInvalidJson
        ? 'O corpo JSON da requisição é inválido.'
      : isUploadError
        ? 'Não foi possível receber o arquivo enviado.'
        : 'Erro interno do servidor.';

  if (status >= 500) console.error('❌ Erro não tratado na API:', error);
  res.status(status).json({ error: message });
});

export default app;
