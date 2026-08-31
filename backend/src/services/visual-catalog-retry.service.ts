import { prisma } from '../config/prisma';
import { AuditService } from './audit.service';
import { DocumentService } from './document.service';
import { isVisualQuotaFailure } from '../utils/visual-catalog-retry-policy';

const documentService = new DocumentService();

function retryCooldownHours(): number {
  const configured = Number(process.env.VISUAL_RETRY_COOLDOWN_HOURS || '20');
  return Number.isFinite(configured) ? Math.min(72, Math.max(6, Math.trunc(configured))) : 20;
}

export async function visualCatalogRetryStatus(tenantId: string) {
  const documents = await prisma.document.findMany({
    where: {
      tenantId,
      archivedAt: null,
      status: 'FAILED',
      processingJobId: null,
      processingStage: { not: 'REMOVED' },
      storagePath: { not: null },
    },
    select: { id: true, filename: true, processingError: true },
  });
  const candidates = documents.filter(document => isVisualQuotaFailure(document.processingError));
  const cooldownSince = new Date(Date.now() - retryCooldownHours() * 60 * 60 * 1000);
  const recent = candidates.length ? await prisma.auditLog.findMany({
    where: {
      tenantId,
      action: 'AI_VISUAL_CATALOG_RETRY_REQUESTED',
      targetId: { in: candidates.map(document => document.id) },
      createdAt: { gte: cooldownSince },
    },
    select: { targetId: true },
  }) : [];
  const coolingDown = new Set(recent.map(row => row.targetId).filter(Boolean));
  const eligible = candidates.filter(document => !coolingDown.has(document.id));
  return {
    candidates: candidates.length,
    eligible: eligible.length,
    coolingDown: candidates.length - eligible.length,
    cooldownHours: retryCooldownHours(),
    documents: eligible.map(document => ({ id: document.id, filename: document.filename })),
  };
}

export async function retryEligibleVisualCatalogs(tenantId: string, userId: string | null, requested = 1) {
  const status = await visualCatalogRetryStatus(tenantId);
  const limit = Math.min(3, Math.max(1, Math.trunc(requested)));
  const queued: Array<{ id: string; filename: string }> = [];
  const failures: Array<{ id: string; filename: string; error: string }> = [];

  for (const document of status.documents.slice(0, limit)) {
    try {
      await documentService.reprocess(tenantId, document.id);
      await AuditService.record({
        tenantId,
        userId,
        action: 'AI_VISUAL_CATALOG_RETRY_REQUESTED',
        targetType: 'DOCUMENT',
        targetId: document.id,
        metadata: { filename: document.filename, reason: 'DAILY_AI_QUOTA_RECOVERY' },
      });
      queued.push(document);
    } catch (error) {
      failures.push({
        ...document,
        error: (error instanceof Error ? error.message : String(error)).slice(0, 240),
      });
    }
  }
  return { queued, failures, statusBefore: status };
}

export async function retryVisualCatalogsAfterStartup() {
  if (String(process.env.ENABLE_AUTOMATIC_VISUAL_RETRY || 'true').toLowerCase() === 'false') {
    return { tenants: 0, queued: 0, failures: 0 };
  }

  const candidates = await prisma.document.findMany({
    where: {
      archivedAt: null,
      status: 'FAILED',
      processingJobId: null,
      processingStage: { not: 'REMOVED' },
      storagePath: { not: null },
    },
    select: { tenantId: true, processingError: true },
  });
  const tenantIds = [...new Set(candidates
    .filter(document => isVisualQuotaFailure(document.processingError))
    .map(document => document.tenantId))];
  let queued = 0;
  let failures = 0;

  for (const tenantId of tenantIds) {
    const result = await retryEligibleVisualCatalogs(tenantId, null, 1);
    queued += result.queued.length;
    failures += result.failures.length;
  }

  return { tenants: tenantIds.length, queued, failures };
}
