import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { COMMERCIAL_PRICE_DIVISOR } from './price-list-rules';
import { parsePriceListHtml } from './price-list-html';
import { diffPriceList, percentBuckets, type StoredPart } from './price-list-diff';
import { HTML_IMPORT_SOURCE, writePriceListPlan } from '../services/price-list-update.service';

// Compara a lista .html com o banco e escreve um relatório. Sem --apply é só
// LEITURA: nada é gravado.
//
// Uso:  npm run report:price-list-html -- "C:\caminho\lista.html" [--out=C:\pasta\relatorio.csv]
// Grava: ... --apply --expect-changed=80 --expect-added=1177
//
// Com --apply, grava só o que foi aprovado: atualiza o preço dos códigos que já
// existem e cria os códigos novos. NUNCA apaga nada nem mexe nos códigos que a
// lista não traz (esses ficam com o preço que têm). Os números esperados são uma
// trava: se a lista ou o banco mudaram desde a aprovação, nada é gravado.
// Escreva o --out FORA do repositório (público) e fora do OneDrive.

const prisma = new PrismaClient();

function expectedCount(name: string): number {
  const raw = process.argv.find(argument => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value < 0) {
    throw new Error(`--apply exige --${name}=<número>, o valor que foi aprovado no relatório.`);
  }
  return value;
}

const brl = (value: number | null): string =>
  value === null ? '—' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const int = (value: number): string => value.toLocaleString('pt-BR');

function csvCell(input: string | number | null): string {
  const text = input === null ? '' : String(input);
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function resolveTenant(): Promise<{ id: string; name: string }> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });
  if (tenants.length !== 1) throw new Error(`Esperava 1 tenant, encontrei ${tenants.length}.`);
  return tenants[0];
}

async function main(): Promise<void> {
  const fileArg = process.argv.slice(2).find(argument => !argument.startsWith('--'));
  if (!fileArg) throw new Error('Informe o caminho do .html da lista de preços.');
  const outArg = process.argv.find(argument => argument.startsWith('--out='))?.slice('--out='.length);

  const filePath = path.resolve(process.cwd(), fileArg);
  const raw = readFileSync(filePath);
  const sourceHash = createHash('sha256').update(raw).digest('hex');
  const list = parsePriceListHtml(raw.toString('utf8'));
  const tenant = await resolveTenant();

  const stored: StoredPart[] = await prisma.masterPart.findMany({
    where: { tenantId: tenant.id },
    select: { normalizedNumber: true, partNumber: true, name: true, price: true, ncm: true, ean: true, category: true },
  });

  const diff = diffPriceList(stored, list.items);

  console.log(`\nRelatório de diferenças — SOMENTE LEITURA (nada foi gravado)`);
  console.log(`Regra: preço do arquivo ÷ ${COMMERCIAL_PRICE_DIVISOR}\n`);
  console.log(`Arquivo: ${int(list.stats.rows)} linhas → ${int(list.stats.uniqueCodes)} códigos únicos`);
  console.log(`  sem código: ${list.stats.rowsWithoutCode} · preço fora do padrão: ${list.stats.rowsWithBadPrice}`);
  console.log(`  recusados por preço conflitante: ${list.rejected.length}`);
  for (const item of list.resolved) {
    console.log(`  decidido pelo dono: ${item.normalizedNumber} vale ${brl(item.chosen)} (ignorado: ${item.ignored.map(brl).join(' / ')})`);
  }
  for (const item of list.rejected) {
    console.log(`    ${item.normalizedNumber}: ${item.prices.map(brl).join(' / ')}`);
  }
  console.log(`Banco:   ${int(diff.stored)} códigos\n`);
  console.log(`Mesmo preço:          ${int(diff.unchanged)}`);
  console.log(`Preço muda:           ${int(diff.changed.length)}`);
  console.log(`Código novo no arquivo: ${int(diff.added.length)}`);
  console.log(`Só no banco (não atualiza): ${int(diff.missingFromList.length)}`);
  console.log(`Nome diferente:       ${int(diff.namesDiffer)}\n`);

  const countBy = <T,>(rows: T[], key: (row: T) => string): Array<[string, number]> => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  };
  console.log('Só no banco, por categoria:');
  for (const [label, count] of countBy(diff.missingFromList, row => row.category ?? '(sem categoria)')) {
    console.log(`  ${label.padEnd(48)} ${int(count)}`);
  }
  console.log('Código novo no arquivo, por lista:');
  for (const [label, count] of countBy(diff.added, row => row.section)) console.log(`  ${label.padEnd(48)} ${int(count)}`);
  console.log('Banco inteiro, por categoria:');
  for (const [label, count] of countBy(stored, row => row.category ?? '(sem categoria)')) {
    console.log(`  ${label.padEnd(48)} ${int(count)}`);
  }

  console.log('\nVariação dos preços que mudam:');
  for (const bucket of percentBuckets(diff.changed)) {
    console.log(`  ${bucket.label.padEnd(22)} ${int(bucket.count)}`);
  }

  const withPercent = diff.changed.filter(change => change.percent !== null);
  const show = (title: string, rows: typeof withPercent): void => {
    console.log(`\n${title}`);
    for (const row of rows) {
      console.log(
        `  ${row.partNumber.padEnd(14)} ${brl(row.before).padStart(12)} → ${brl(row.after).padStart(12)} ` +
          `${(row.percent as number).toFixed(1).padStart(7)}%  ${row.name.slice(0, 40)}`,
      );
    }
  };
  show('15 maiores aumentos:', [...withPercent].sort((a, b) => (b.percent as number) - (a.percent as number)).slice(0, 15));
  show('15 maiores quedas:', [...withPercent].sort((a, b) => (a.percent as number) - (b.percent as number)).slice(0, 15));

  if (outArg) {
    const lines = [['situacao', 'codigo', 'descricao', 'preco_banco', 'preco_novo', 'variacao_pct'].join(';')];
    for (const row of diff.changed) {
      lines.push(
        ['MUDA', row.partNumber, row.name, row.before, row.after, row.percent === null ? '' : row.percent.toFixed(2)]
          .map(csvCell)
          .join(';'),
      );
    }
    for (const row of diff.added) {
      lines.push(['NOVO', row.partNumber, row.name, '', row.consumerPrice, ''].map(csvCell).join(';'));
    }
    for (const row of diff.missingFromList) {
      lines.push(['SO_NO_BANCO', row.partNumber, row.name, row.price, '', ''].map(csvCell).join(';'));
    }
    // BOM para o Excel abrir acentos certos; separador ";" como o Excel pt-BR espera.
    writeFileSync(path.resolve(outArg), `\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
    console.log(`\nDetalhe completo gravado em: ${path.resolve(outArg)}`);
  }

  if (!process.argv.includes('--apply')) {
    console.log('\nSomente leitura. Para gravar: --apply --expect-changed=<N> --expect-added=<N>');
    return;
  }

  const expectChanged = expectedCount('expect-changed');
  const expectAdded = expectedCount('expect-added');
  if (diff.changed.length !== expectChanged || diff.added.length !== expectAdded) {
    throw new Error(
      `Os números mudaram desde a aprovação: preços ${diff.changed.length} (aprovado ${expectChanged}), ` +
        `códigos novos ${diff.added.length} (aprovado ${expectAdded}). Nada foi gravado.`,
    );
  }

  if (diff.changed.length === 0 && diff.added.length === 0) {
    console.log('\nNada a gravar: o banco já bate com a lista.');
    return;
  }

  console.log(`\nGravando: ${diff.changed.length} preços e ${diff.added.length} códigos novos…`);
  await writePriceListPlan(prisma, tenant.id, diff, path.basename(filePath), sourceHash, list.stats.rows);
  console.log(`
✓ Gravado: ${diff.changed.length} preços atualizados, ${diff.added.length} códigos novos (${HTML_IMPORT_SOURCE}).`);

  // Confere: relê o banco e compara de novo. Tem que sobrar zero diferença.
  const after: StoredPart[] = await prisma.masterPart.findMany({
    where: { tenantId: tenant.id },
    select: { normalizedNumber: true, partNumber: true, name: true, price: true, ncm: true, ean: true, category: true },
  });
  const check = diffPriceList(after, list.items);
  console.log(`Conferência: preço muda ${check.changed.length} · código novo ${check.added.length} · banco ${int(check.stored)} códigos`);
  if (check.changed.length !== 0 || check.added.length !== 0) {
    throw new Error('A conferência final achou diferença: revise o banco antes de seguir.');
  }
  console.log('✓ Conferido: o banco bate com a lista.');
}

main()
  .catch(error => {
    console.error('\n✗ Erro no relatório:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
