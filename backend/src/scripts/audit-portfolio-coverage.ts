import 'dotenv/config';
import { prisma } from '../config/prisma';
import { buildPortfolioCoverage } from '../services/portfolio-coverage';

function argValue(name: string): string {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length).trim() || '';
}

async function main() {
  const tenantId = argValue('tenant') || process.env.BENCHMARK_TENANT_ID || '';
  if (!tenantId) throw new Error('Informe --tenant=<tenantId> ou BENCHMARK_TENANT_ID.');

  const verifyPortal = process.argv.includes('--portal');
  const requestedConcurrency = Number(argValue('concurrency') || '2');
  const concurrency = Number.isFinite(requestedConcurrency) ? Math.max(1, Math.min(4, Math.trunc(requestedConcurrency))) : 2;
  const coverage = await buildPortfolioCoverage(tenantId, { verifyPortal, concurrency });

  console.log('\n🧭 Cobertura do portfólio CogniVault');
  console.log(`   Universo de modelos conhecidos: ${coverage.total}`);
  console.log(`   IPL local:                     ${coverage.localIpl}`);
  console.log(`   IPL oficial no Portal:         ${coverage.portalIpl}`);
  console.log(`   Ainda não comprovados:         ${coverage.unverified}`);
  console.log(`   Cobertura técnica:              ${(coverage.coverageRate * 100).toFixed(1)}%`);
  console.log(`   Portal consultado:              ${verifyPortal ? 'sim' : 'não'}`);
  console.log('   Observação: cadastro comercial descobre modelos; somente IPL local/Portal conta como cobertura técnica.\n');

  const gaps = coverage.items.filter(item => item.status === 'UNVERIFIED');
  if (gaps.length) {
    console.log('⚠️ Modelos/aplicações ainda sem fonte técnica comprovada:');
    for (const item of gaps) console.log(`   - ${item.model}`);
  } else {
    console.log('✅ Todos os modelos descobertos possuem uma fonte IPL comprovada.');
  }
}

main()
  .catch(error => {
    console.error('❌ Auditoria de portfólio não executada:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
