import { Prisma } from '@prisma/client';

export function isDocumentBusy(status: string, processingJobId?: string | null): boolean {
  if (status === 'FAILED') return false;
  return Boolean(processingJobId) || status === 'PENDING' || status === 'PROCESSING';
}

export function idleDocumentReservationWhere(documentId: string, tenantId: string): Prisma.DocumentWhereInput {
  return {
    id: documentId,
    tenantId,
    archivedAt: null,
    OR: [
      { status: 'FAILED' },
      { processingJobId: null, status: { notIn: ['PENDING', 'PROCESSING'] } },
    ],
  };
}

export function reprocessableDocumentReservationWhere(documentId: string, tenantId: string): Prisma.DocumentWhereInput {
  return {
    ...idleDocumentReservationWhere(documentId, tenantId),
    processingStage: { notIn: ['REMOVING', 'REMOVED'] },
  };
}

export function restorableDocumentLookupWhere(documentId: string, tenantId: string): Prisma.DocumentWhereInput {
  return {
    id: documentId,
    tenantId,
    archivedAt: { not: null },
    processingStage: { notIn: ['REMOVING', 'REMOVED'] },
  };
}
