import 'dotenv/config';
import { prisma } from '../config/prisma';

async function main() {
  const [
    tenants,
    users,
    documents,
    parts,
    masterParts,
    feedback,
    auditLogs,
    verifications,
    missingStorage,
    activeFailedMigrations,
    rolledBackMigrations,
    appliedMigrations,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.document.count(),
    prisma.part.count(),
    prisma.masterPart.count(),
    prisma.searchFeedback.count(),
    prisma.auditLog.count(),
    prisma.officialPartVerification.count(),
    prisma.document.count({
      where: {
        status: 'COMPLETED',
        archivedAt: null,
        OR: [{ storagePath: null }, { storagePath: '' }],
      },
    }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "_prisma_migrations"
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "_prisma_migrations"
      WHERE rolled_back_at IS NOT NULL
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `,
  ]);

  const activeFailed = Number(activeFailedMigrations[0]?.count || 0n);
  const rolledBack = Number(rolledBackMigrations[0]?.count || 0n);
  const applied = Number(appliedMigrations[0]?.count || 0n);
  const status = activeFailed === 0 && missingStorage === 0 ? 'READY' : 'ATTENTION';

  console.log('\n🛟 CogniVault · prontidão de recuperação');
  console.log(`   Status:                         ${status}`);
  console.log(`   Migrations aplicadas:           ${applied}`);
  console.log(`   Falhas de migration ativas:     ${activeFailed}`);
  console.log(`   Rollbacks históricos:           ${rolledBack}`);
  console.log(`   Tenants:                        ${tenants}`);
  console.log(`   Usuários:                       ${users}`);
  console.log(`   Documentos:                     ${documents}`);
  console.log(`   Peças técnicas:                 ${parts}`);
  console.log(`   Peças comerciais:               ${masterParts}`);
  console.log(`   Feedbacks:                      ${feedback}`);
  console.log(`   Logs de auditoria:              ${auditLogs}`);
  console.log(`   Verificações oficiais:          ${verifications}`);
  console.log(`   PDFs ativos sem storagePath:    ${missingStorage}`);
  console.log('');
  console.log('Rollbacks históricos já resolvidos são informativos e não bloqueiam READY.');
  console.log('Este comando valida consistência mínima; ele NÃO substitui um backup nem um restore drill.');
  console.log('Banco PostgreSQL e bucket privado de PDFs devem ser protegidos e testados separadamente.\n');

  if (activeFailed > 0) process.exitCode = 2;
  else if (missingStorage > 0) process.exitCode = 3;
}

main()
  .catch(error => {
    console.error('❌ Auditoria de recuperação falhou:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
