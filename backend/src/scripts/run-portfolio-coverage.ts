import 'dotenv/config';
import { prisma } from '../config/prisma';
import { PortfolioCoverageService } from '../services/portfolio-coverage.service';

function argValue(name: string): string {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length).trim() || '';
}

function enabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value || '').trim().toLowerCase());
}

async function main() {
  const tenantId = argValue('tenant') || process.env.BENCHMARK_TENANT_ID || '';
  if (!tenantId) throw new Error('Informe --tenant=<tenantId> ou BENCHMARK_TENANT_ID.');

  const refreshOfficial = process.argv.includes('--official') || enabled(process.env.PORTFOLIO_REFRESH_OFFICIAL);
  const max = Number(argValue('max') || process.env.PORTFOLIO_REFRESH_LIMIT || '500');
  const refreshLimit = Number.isFinite(max) ? Math.max(1, Math.min(2_000, Math.trunc(max))) : 500;

  const snapshot = refreshOfficial
    ? await PortfolioCoverageService.refreshOfficialGaps(tenantId, refreshLimit)
    : await PortfolioCoverageService.snapshot(tenantId);

  console.log('\n📚 Cobertura técnica do portfólio');
  console.log(`   Modelos/aplicações conhecidos: ${snapshot.totalKnownModels}`);
  console.log(`   Com IPL local:                ${snapshot.localIplModels}`);
  console.log(`   Cobertos por Portal/cache:    ${snapshot.officialCachedModels}`);
  console.log(`   Ainda sem evidência técnica:  ${snapshot.uncoveredModels}`);
  console.log(`   Cobertura verificável:        ${(snapshot.coveragePercent * 100).toFixed(1)}%`);
  console.log(`   Atualização oficial:          ${refreshOfficial ? `sim (até ${refreshLimit} lacunas)` : 'não'}\n`);

  const gaps = snapshot.items.filter(item => item.coverage === 'UNVERIFIED');
  if (gaps.length) {
    console.log('⚠️ Lacunas de cobertura:');
    for (const item of gaps) console.log(`   - ${item.model} · origem: ${item.sources.join(' + ')}`);
  } else {
    console.log('✅ Nenhuma lacuna conhecida entre os modelos/aplicações inventariados.');
  }
}

main()
  .catch(error => {
    console.error('❌ Auditoria de portfólio falhou:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
