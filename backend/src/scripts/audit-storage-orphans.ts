import { prisma } from '../config/prisma';
import { storageBucket, supabase } from '../config/supabase-storage';
import {
  findOrphanStorageObjects,
  type StorageDocumentReference,
  type StorageObjectReference,
} from '../services/storage-reconciliation';

const PAGE_SIZE = 100;

async function listObjects(prefix: string | null, tenantId: string): Promise<StorageObjectReference[]> {
  const objects: StorageObjectReference[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage.from(storageBucket).list(prefix || undefined, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) {
      throw new Error(`Falha ao listar Storage ${prefix ? `do tenant ${tenantId}` : 'na raiz'}: ${error.message}`);
    }
    const files = (data || []).filter(entry => entry.id);
    objects.push(...files.map(entry => ({
      tenantId,
      path: prefix ? `${prefix}/${entry.name}` : entry.name,
    })));
    if (files.length < PAGE_SIZE) return objects;
  }
}

async function main(): Promise<void> {
  const documents = await prisma.document.findMany({
    select: { id: true, tenantId: true, storagePath: true },
  });
  const references: StorageDocumentReference[] = documents.map(document => ({
    documentId: document.id,
    tenantId: document.tenantId,
    storagePath: document.storagePath,
  }));
  const tenantIds = [...new Set(documents.map(document => document.tenantId))];
  const objects = [
    ...(await listObjects(null, '')),
    ...(await Promise.all(tenantIds.map(tenantId => listObjects(tenantId, tenantId)))).flat(),
  ];
  const orphans = findOrphanStorageObjects(references, objects);

  console.log(JSON.stringify({
    bucket: storageBucket,
    tenantsChecked: tenantIds.length,
    documentsChecked: documents.length,
    objectsChecked: objects.length,
    orphanCount: orphans.length,
    orphans,
  }, null, 2));
}

main()
  .catch(error => {
    console.error('Falha na auditoria de órfãos do Storage:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
