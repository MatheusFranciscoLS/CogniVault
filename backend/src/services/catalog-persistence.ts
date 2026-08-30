import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export type CatalogRevisionItem = {
  item: {
    documentId: string;
    manufacturer: string | null;
    normalizedManufacturer: string | null;
    model: string;
    normalizedModel: string;
    pnc: string | null;
    normalizedPnc: string | null;
    universalAcrossPnc: boolean;
    section: string | null;
    position: string | null;
    name: string;
    normalizedName: string;
    alternativeNames: string[];
    partNumber: string;
    normalizedPartNumber: string;
    page: number | null;
    notes: string | null;
    searchText: string;
  };
  sourceKey: string;
  existingId: string | null;
};

export type CatalogRevisionDocumentData = {
  manufacturer: string | null;
  model: string | null;
  pnc: string | null;
  storagePath: string;
  url: string;
  contentHash: string;
  sourceRowCount: number;
};

/**
 * Persiste uma revisão inteira sem executar um UPDATE de vector por peça.
 * Novas peças entram via createManyAndReturn; IDs existentes continuam estáveis
 * para preservar favoritos/feedback/histórico. Tudo só fica visível quando a
 * transação finaliza, portanto uma falha não deixa metade da revisão ativa.
 */
export async function persistCatalogRevision(params: {
  documentId: string;
  jobId: string;
  revision: number;
  items: CatalogRevisionItem[];
  document: CatalogRevisionDocumentData;
}): Promise<string[]> {
  const { documentId, jobId, revision, items, document } = params;
  return prisma.$transaction(async tx => {
    const ids: string[] = [];
    const existing = items.filter(item => item.existingId);
    const fresh = items.filter(item => !item.existingId);

    for (const identified of existing) {
      const saved = await tx.part.update({
        where: { id: identified.existingId as string },
        data: {
          ...identified.item,
          sourceKey: identified.sourceKey,
          active: true,
          retiredAt: null,
          extractionRevision: revision,
          embeddingRevision: 0,
        },
        select: { id: true },
      });
      ids.push(saved.id);
    }

    if (fresh.length) {
      const created = await tx.part.createManyAndReturn({
        data: fresh.map(identified => ({
          ...identified.item,
          sourceKey: identified.sourceKey,
          active: true,
          retiredAt: null,
          extractionRevision: revision,
          embeddingRevision: 0,
        })),
        select: { id: true, sourceKey: true },
      });
      const idBySourceKey = new Map(created.map(part => [part.sourceKey, part.id]));
      for (const identified of fresh) {
        const id = idBySourceKey.get(identified.sourceKey);
        if (!id) throw new Error(`CATALOG_PERSISTENCE_MISSING_ID:${identified.sourceKey}`);
        ids.push(id);
      }
    }

    // Um único UPDATE substitui centenas de tx.$executeRaw individuais.
    await tx.$executeRaw`
      UPDATE "Part"
      SET "embedding" = NULL, "embeddingRevision" = 0
      WHERE "documentId" = ${documentId} AND "extractionRevision" = ${revision}
    `;

    await tx.part.updateMany({
      where: { documentId, active: true, id: { notIn: ids } },
      data: { active: false, retiredAt: new Date() },
    });

    const updated = await tx.document.updateMany({
      where: { id: documentId, processingJobId: jobId },
      data: {
        manufacturer: document.manufacturer,
        model: document.model,
        pnc: document.pnc,
        storagePath: document.storagePath,
        url: document.url,
        contentHash: document.contentHash,
        sourceRowCount: document.sourceRowCount,
        status: 'COMPLETED',
        catalogRevision: revision,
        processingStage: 'INDEXING',
        processingCurrent: 0,
        processingTotal: items.length,
        processingError: null,
      },
    });
    if (updated.count !== 1) throw new Error('STALE_DOCUMENT_JOB');
    return ids;
  }, { maxWait: 15_000, timeout: 300_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
