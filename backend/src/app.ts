import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import routes from './routes';
import { prisma } from './config/prisma';
import { allowedCorsOrigins, isAllowedCorsOrigin } from './config/cors';
import { rabbitMQ } from './queues/connection';
import { requestPerformanceMiddleware } from './services/request-performance';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';

const app = express();

// Render termina TLS e encaminha a requisição por um proxy reverso antes de
// chegar ao processo Node. Confiar exatamente em um hop permite que o Express
// e o express-rate-limit usem o IP real do cliente sem aceitar uma cadeia
// arbitrária de X-Forwarded-For enviada pelo próprio cliente.
app.set('trust proxy', 1);

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

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.disable('x-powered-by');

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/health') || req.path === '/api/cron/keepalive',
  message: { error: 'Muitas requisições deste IP, tente novamente em um minuto.' },
});

app.use(apiLimiter);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (isAllowedCorsOrigin(origin, allowedOrigins)) return callback(null, true);
    return callback(new HttpError(403, 'Origem não permitida pelo CORS.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(compression());
app.use(express.json({ limit: '2mb' }));

// Métricas rolling em memória: não aumentam o banco e permitem enxergar
// média/p95/máximo por endpoint no painel administrativo.
app.use(requestPerformanceMiddleware);

app.get('/health/live', (_req, res) => {
  res.status(200).set('Cache-Control', 'no-store').json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.head('/health/live', (_req, res) => {
  res.set('Cache-Control', 'no-store').status(200).end();
});

app.get('/api/cron/keepalive', (_req, res) => {
  res.status(200).set('Cache-Control', 'no-store').json({
    ok: true,
    message: 'CogniVault keepalive OK',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', routes);

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
  const degraded = !databaseReady || !queue.ready;

  res
    .status(databaseReady ? 200 : 503)
    .set('Cache-Control', 'no-store')
    .json({
      status: !degraded ? 'online' : 'degraded',
      checks: {
        database: { ready: databaseReady, error: databaseError },
        queue: { ready: queue.ready, lastError: queue.lastError },
      },
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const isUploadError = error instanceof multer.MulterError;
  const isCustomUploadError = error instanceof Error && error.message === 'Somente arquivos PDF são permitidos.';
  const bodyErrorType = typeof error === 'object' && error !== null && 'type' in error
    ? String(error.type)
    : '';
  const isInvalidJson = error instanceof SyntaxError && bodyErrorType === 'entity.parse.failed';
  const isBodyTooLarge = bodyErrorType === 'entity.too.large';
  const isUploadTooLarge = isUploadError && error.code === 'LIMIT_FILE_SIZE';
  const isPayloadTooLarge = isUploadTooLarge || isBodyTooLarge;
  const status = error instanceof HttpError
    ? error.status
    : isCustomUploadError
      ? 400
      : isPayloadTooLarge
        ? 413
        : isUploadError || isInvalidJson
          ? 400
          : 500;
  const message = error instanceof HttpError
    ? error.message
    : isCustomUploadError
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
