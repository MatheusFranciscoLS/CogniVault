import { Response } from 'express';
import { LRUCache } from 'lru-cache';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const NOTIFICATION_FRESH_MS = Math.max(
  15_000,
  Number(process.env.NOTIFICATION_CACHE_TTL_MS || '90000') || 90_000,
);

const NOTIFICATION_RETENTION_MS = Math.max(
  NOTIFICATION_FRESH_MS + 60_000,
  Number(process.env.NOTIFICATION_CACHE_RETENTION_MS || '300000') || 300_000,
);

type NotificationItem = {
  id: string;
  type: 'warning' | 'error' | 'processing' | 'info';
  title: string;
  description: string;
  createdAt: Date;
};

type NotificationPayload = {
  notifications: NotificationItem[];
};

type CachedNotification = {
  payload: NotificationPayload;
  fetchedAt: number;
};

const notificationCache = new LRUCache<string, CachedNotification>({
  max: 400,
  // Mantém uma cópia utilizável por alguns minutos para que uma atualização
  // periódica nunca bloqueie o balcão esperando o banco remoto.
  ttl: NOTIFICATION_RETENTION_MS,
});

const notificationRefreshes = new Map<string, Promise<void>>();

export function invalidateNotificationCache(tenantId?: string): void {
  if (!tenantId) {
    notificationCache.clear();
    return;
  }

  for (const key of notificationCache.keys()) {
    if (key.startsWith(`${tenantId}:`)) notificationCache.delete(key);
  }
}

function cacheHeaders(res: Response, status: 'HIT' | 'MISS' | 'STALE'): void {
  // Conteúdo autenticado: pode ficar no cache privado do navegador, nunca em cache compartilhado.
  res.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
  res.set('X-CogniVault-Cache', status);
}

async function loadNotifications(tenantId: string, isAdmin: boolean): Promise<NotificationPayload> {
  const [documents, audits, verifications] = await Promise.all([
    prisma.document.findMany({
      where: {
        tenantId,
        archivedAt: null,
        status: { in: ['FAILED', 'PROCESSING', 'PENDING'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, filename: true, status: true, createdAt: true },
    }),
    isAdmin
      ? prisma.auditLog.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 12,
          select: {
            id: true,
            action: true,
            targetType: true,
            createdAt: true,
            user: { select: { email: true } },
          },
        })
      : Promise.resolve([]),
    isAdmin
      ? prisma.officialPartVerification.findMany({
          where: { tenantId, approvalStatus: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            queriedPartNumber: true,
            currentPartNumber: true,
            status: true,
            user: { select: { email: true } },
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const items: NotificationItem[] = [
    ...verifications.map((item) => {
      const isSuperseded = item.status === 'SUPERSEDED'
        || item.queriedPartNumber.replace(/\W/g, '') !== item.currentPartNumber.replace(/\W/g, '');
      const label = isSuperseded
        ? `Substituição ${item.queriedPartNumber} → ${item.currentPartNumber}`
        : `Conferência da peça ${item.queriedPartNumber}`;

      return {
        id: `verification-${item.id}`,
        type: 'warning' as const,
        title: 'Conferência pendente de aprovação',
        description: `${label} (por ${item.user.email})`,
        createdAt: item.createdAt,
      };
    }),
    ...documents.map((item) => ({
      id: `doc-${item.id}`,
      type: item.status === 'FAILED' ? 'error' as const : 'processing' as const,
      title: item.status === 'FAILED' ? 'Falha no processamento' : 'Catálogo em processamento',
      description: item.filename,
      createdAt: item.createdAt,
    })),
    ...audits.map((item) => ({
      id: `audit-${item.id}`,
      type: 'info' as const,
      title: item.action.replaceAll('_', ' '),
      description: item.user?.email || 'Sistema',
      createdAt: item.createdAt,
    })),
  ]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 20);

  return { notifications: items };
}

function storeNotifications(cacheKey: string, payload: NotificationPayload): void {
  notificationCache.set(cacheKey, {
    payload,
    fetchedAt: Date.now(),
  });
}

function refreshInBackground(cacheKey: string, tenantId: string, isAdmin: boolean): void {
  if (notificationRefreshes.has(cacheKey)) return;

  const refresh = loadNotifications(tenantId, isAdmin)
    .then((payload) => {
      storeNotifications(cacheKey, payload);
    })
    .catch((error) => {
      console.warn(
        '⚠️ Não foi possível atualizar notificações em segundo plano:',
        error instanceof Error ? error.message : error,
      );
    })
    .finally(() => {
      notificationRefreshes.delete(cacheKey);
    });

  notificationRefreshes.set(cacheKey, refresh);
}

export class NotificationController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const tenantId = req.user.tenantId;
    const isAdmin = req.user.role === 'ADMIN';
    const cacheKey = `${tenantId}:${isAdmin ? 'ADMIN' : 'USER'}`;
    const cached = notificationCache.get(cacheKey);

    if (cached) {
      const stale = Date.now() - cached.fetchedAt >= NOTIFICATION_FRESH_MS;
      cacheHeaders(res, stale ? 'STALE' : 'HIT');

      // Responde imediatamente com a última visão conhecida. Quando ela envelhece,
      // a atualização é disparada sem prender a resposta ao tempo de rede/DB.
      if (stale) refreshInBackground(cacheKey, tenantId, isAdmin);

      res.json(cached.payload);
      return;
    }

    try {
      const payload = await loadNotifications(tenantId, isAdmin);
      storeNotifications(cacheKey, payload);
      cacheHeaders(res, 'MISS');
      res.json(payload);
    } catch (error) {
      console.error('❌ Erro ao carregar notificações:', error);
      res.status(500).json({ error: 'Erro ao carregar notificações.', notifications: [] });
    }
  }
}
