import 'dotenv/config';
import { prisma } from '../config/prisma';
import { buildPortfolioCoverage, rankPortfolioCoverageGaps } from '../services/portfolio-coverage';

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

  console.log('\n🧭 Cobertura do portfólio CogniVault — escopo Brasil/local');
  console.log(`   Modelos citados nas fontes locais: ${coverage.total}`);
  console.log(`   IPL local cadastrada:              ${coverage.localIpl}`);
  console.log(`   IPL oficial no Portal BR:          ${coverage.portalIpl}`);
  console.log(`   Sem fonte técnica comprovada:      ${coverage.unverified}`);
  console.log(`   Cobertura técnica:                 ${(coverage.coverageRate * 100).toFixed(1)}%`);
  console.log(`   Portal BR consultado:              ${verifyPortal ? 'sim' : 'não'}`);
  console.log('   Escopo técnico: somente IPL local cadastrada e Portal Husqvarna Brasil.');
  console.log('   Aplicações da lista comercial brasileira servem apenas para descobrir demanda/modelos; não comprovam compatibilidade técnica.\n');

  const gaps = rankPortfolioCoverageGaps(coverage.items, 20);
  if (gaps.length) {
    console.log('⚠️ Prioridades locais sem IPL técnica comprovada:');
    for (const item of gaps) {
      const portalState = item.portalVerification || 'NOT_CHECKED';
      console.log(`   - ${item.model}: ${item.commercialSignals} referência(s) comercial(is) · Portal ${portalState}`);
      if (item.commercialEvidence.length) {
        console.log(`     Ex.: ${item.commercialEvidence[0]}`);
      }
      if (item.portalVerificationNote) {
        console.log(`     Diagnóstico: ${item.portalVerificationNote}`);
      }
    }
    console.log('\n   Interpretação: esses modelos não possuem IPL local ativa no CogniVault.');
    console.log('   Ação correta: cadastrar uma IPL usada pela revenda ou homologar no Portal BR; não buscar catálogos internacionais para elevar cobertura.');
  } else {
    console.log('✅ Todos os modelos descobertos localmente possuem uma fonte IPL comprovada no escopo Brasil/local.');
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
