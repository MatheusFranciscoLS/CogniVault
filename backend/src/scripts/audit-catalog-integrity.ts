import 'dotenv/config';
import { prisma } from '../config/prisma';

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length).trim() || null;
}

function expectedEngineManufacturer(filename: string): string | null {
  if (/\bKawasaki\b/i.test(filename)) return 'Kawasaki';
  if (/\bBriggs\b/i.test(filename)) return 'Briggs & Stratton';
  if (/\bKohler\b/i.test(filename)) return 'Kohler';
  if (/\bHonda\b/i.test(filename)) return 'Honda';
  return null;
}

async function resolveTenantId(): Promise<string> {
  const explicitId = arg('tenant');
  if (explicitId) return explicitId;

  const tenantName = arg('tenant-name');
  if (!tenantName) throw new Error('Informe --tenant=UUID ou --tenant-name="Nome".');
  const tenant = await prisma.tenant.findFirst({ where: { name: tenantName }, select: { id: true } });
  if (!tenant) throw new Error(`Tenant não encontrado: ${tenantName}`);
  return tenant.id;
}

async function main(): Promise<void> {
  const tenantId = await resolveTenantId();
  const documents = await prisma.document.findMany({
    where: {
      tenantId,
      archivedAt: null,
      status: 'COMPLETED',
      processingStage: { not: 'REMOVED' },
    },
    select: {
      id: true,
      filename: true,
      manufacturer: true,
      reviewStatus: true,
      healthScore: true,
      extractionSnapshot: true,
    },
    orderBy: { filename: 'asc' },
  });

  const documentIds = documents.map(document => document.id);
  const parts = documentIds.length
    ? await prisma.part.findMany({
        where: { documentId: { in: documentIds }, active: true },
        select: {
          documentId: true,
          positionStatus: true,
          page: true,
          section: true,
          partNumber: true,
          sourceKey: true,
        },
      })
    : [];

  const byDocument = new Map<string, number>();
  for (const part of parts) byDocument.set(part.documentId, (byDocument.get(part.documentId) || 0) + 1);

  const positioned = parts.filter(part => part.positionStatus === 'POSITIONED').length;
  const sourceUnpositioned = parts.filter(part => part.positionStatus === 'SOURCE_UNPOSITIONED').length;
  const suspect = parts.filter(part => part.positionStatus === 'SUSPECT_MISSING').length;
  const missingPage = parts.filter(part => part.page === null).length;
  const missingSection = parts.filter(part => !part.section?.trim()).length;
  const missingCode = parts.filter(part => !part.partNumber?.trim()).length;
  const missingSourceKey = parts.filter(part => !part.sourceKey?.trim()).length;
  const needsReview = documents.filter(document => document.reviewStatus === 'NEEDS_REVIEW').length;
  const below100 = documents.filter(document => document.healthScore < 100).length;

  const manufacturerMismatches = documents
    .map(document => ({ document, expected: expectedEngineManufacturer(document.filename) }))
    .filter(({ document, expected }) => expected && document.manufacturer !== expected);

  const snapshotMismatches = documents.flatMap(document => {
    const snapshot = document.extractionSnapshot;
    const snapshotParts = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
      && Array.isArray((snapshot as Record<string, unknown>).parts)
      ? ((snapshot as Record<string, unknown>).parts as unknown[]).length
      : 0;
    const activeParts = byDocument.get(document.id) || 0;
    return snapshotParts >= 10 && snapshotParts !== activeParts
      ? [{ filename: document.filename, snapshotParts, activeParts }]
      : [];
  });

  console.log('\n=== Auditoria de integridade dos catálogos ===');
  console.log(`Tenant: ${tenantId}`);
  console.log(`Catálogos ativos: ${documents.length}`);
  console.log(`Peças técnicas ativas: ${parts.length}`);
  console.log(`POSITIONED: ${positioned}`);
  console.log(`SOURCE_UNPOSITIONED: ${sourceUnpositioned}`);
  console.log(`SUSPECT_MISSING: ${suspect}`);
  console.log(`Sem página: ${missingPage}`);
  console.log(`Sem seção: ${missingSection}`);
  console.log(`Sem código: ${missingCode}`);
  console.log(`Sem sourceKey: ${missingSourceKey}`);
  console.log(`Catálogos NEEDS_REVIEW: ${needsReview}`);
  console.log(`Catálogos abaixo de 100: ${below100}`);
  console.log(`Fabricante explícito divergente: ${manufacturerMismatches.length}`);
  console.log(`Snapshot x base ativa divergente: ${snapshotMismatches.length}`);

  if (manufacturerMismatches.length) {
    console.log('\nFabricantes divergentes:');
    for (const { document, expected } of manufacturerMismatches) {
      console.log(`- ${document.filename}: ${document.manufacturer || '(vazio)'} -> esperado ${expected}`);
    }
  }

  if (snapshotMismatches.length) {
    console.log('\nDiferenças snapshot/base ativa (informativas; podem ser legítimas quando uma linha não possui código de peça):');
    for (const item of snapshotMismatches) {
      console.log(`- ${item.filename}: snapshot=${item.snapshotParts}, ativas=${item.activeParts}`);
    }
  }

  const blockingIssues = suspect + missingPage + missingSection + missingCode + missingSourceKey + manufacturerMismatches.length;
  if (blockingIssues > 0) {
    console.error(`\n❌ Auditoria encontrou ${blockingIssues} problema(s) estrutural(is) bloqueante(s).`);
    process.exitCode = 1;
  } else {
    console.log('\n✅ Nenhum problema estrutural bloqueante encontrado.');
  }
}

main()
  .catch(error => {
    console.error('❌ Falha na auditoria:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
