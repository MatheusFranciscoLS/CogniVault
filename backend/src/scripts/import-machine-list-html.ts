import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { parseMachineListHtml, type ListedMachine } from './machine-list-html';

// Importa as MÁQUINAS da lista de preços .html para a aba "Tabela de preços".
//
// Uso:  npm run import:machine-list-html -- "C:\caminho\lista.html"
// Grava: ... --apply --expect-count=151
//
// Sem --apply é só LEITURA: compara com o banco e imprime o que mudaria. Com --apply, a tabela vira
// um espelho da lista (máquina que saiu da lista sai da tela), numa transação só, e o número de
// máquinas precisa bater com o que foi aprovado no relatório. Só texto e número entram; nenhuma
// imagem do arquivo é lida. Mantenha o .html FORA do repositório (público) e fora do OneDrive.

const prisma = new PrismaClient();
const TX_OPTIONS = { maxWait: 15_000, timeout: 60_000 };

const brl = (value: number | null): string =>
  value === null ? '—' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function expectedCount(): number {
  const raw = process.argv.find(argument => argument.startsWith('--expect-count='))?.slice('--expect-count='.length);
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value < 0) {
    throw new Error('--apply exige --expect-count=<número>, a quantidade de máquinas aprovada no relatório.');
  }
  return value;
}

async function resolveTenant(): Promise<{ id: string; name: string }> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });
  if (tenants.length !== 1) throw new Error(`Esperava 1 tenant, encontrei ${tenants.length}.`);
  return tenants[0];
}

function toRecord(tenantId: string, machine: ListedMachine, listDate: Date): Prisma.MachineListingCreateManyInput {
  return {
    tenantId,
    pnc: machine.pnc,
    normalizedPnc: machine.normalizedPnc,
    model: machine.model,
    description: machine.description,
    category: machine.category,
    segment: machine.segment,
    technology: machine.technology,
    application: machine.application,
    listPrice: machine.listPrice,
    discontinued: machine.discontinued,
    isNew: machine.isNew,
    priceBefore: machine.priceBefore,
    sortOrder: machine.sortOrder,
    specs: machine.specs as unknown as Prisma.InputJsonValue,
    details: machine.details,
    listDate,
  };
}

async function main(): Promise<void> {
  const fileArg = process.argv.slice(2).find(argument => !argument.startsWith('--'));
  if (!fileArg) throw new Error('Informe o caminho do .html da lista de preços.');
  const filePath = path.resolve(process.cwd(), fileArg);
  const list = parseMachineListHtml(readFileSync(filePath, 'utf8'));
  const tenant = await resolveTenant();

  const stored = await prisma.machineListing.findMany({
    where: { tenantId: tenant.id },
    select: { normalizedPnc: true, model: true, listPrice: true },
  });
  const storedByPnc = new Map(stored.map(row => [row.normalizedPnc, row]));
  const listed = new Set(list.machines.map(machine => machine.normalizedPnc));

  const added = list.machines.filter(machine => !storedByPnc.has(machine.normalizedPnc));
  const removed = stored.filter(row => !listed.has(row.normalizedPnc));
  const repriced = list.machines.filter(machine => {
    const before = storedByPnc.get(machine.normalizedPnc);
    return before !== undefined && Math.abs(before.listPrice - machine.listPrice) >= 0.005;
  });

  console.log(`\nMáquinas da lista de ${list.listDate.toISOString().slice(0, 10)} — SOMENTE LEITURA até o --apply\n`);
  console.log(`Lidas: ${list.machines.length} · recusadas: ${list.rejected.length}`);
  for (const item of list.rejected) console.log(`  recusada ${item.pnc || '(sem PNC)'}: ${item.reason}`);
  console.log(`No banco hoje: ${stored.length}`);
  console.log(`Novas na tabela: ${added.length} · saem da tabela: ${removed.length} · preço diferente do banco: ${repriced.length}`);
  for (const row of removed) console.log(`  sai: ${row.model} (${row.normalizedPnc}) ${brl(row.listPrice)}`);

  const counts = new Map<string, number>();
  for (const machine of list.machines) counts.set(machine.category, (counts.get(machine.category) ?? 0) + 1);
  console.log('\nPor categoria:');
  for (const [category, count] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${category.padEnd(34)} ${count}`);
  console.log(
    `\nNovas na lista: ${list.machines.filter(machine => machine.isNew).length} · preço mudou na lista: ` +
      `${list.machines.filter(machine => machine.priceBefore !== null).length} · descontinuadas: ` +
      `${list.machines.filter(machine => machine.discontinued).length}`,
  );

  if (!process.argv.includes('--apply')) {
    console.log('\nSomente leitura. Para gravar: --apply --expect-count=<N>');
    return;
  }

  const expected = expectedCount();
  if (list.machines.length !== expected) {
    throw new Error(`O arquivo tem ${list.machines.length} máquinas e foram aprovadas ${expected}. Nada foi gravado.`);
  }
  if (list.rejected.length > 0) {
    throw new Error(`${list.rejected.length} máquina(s) recusada(s): corrija o arquivo ou aprove explicitamente. Nada foi gravado.`);
  }

  console.log(`\nGravando ${list.machines.length} máquinas…`);
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cognivault:machine-list:${tenant.id}`}, 0))`;
    await tx.machineListing.deleteMany({ where: { tenantId: tenant.id } });
    const created = await tx.machineListing.createMany({
      data: list.machines.map(machine => toRecord(tenant.id, machine, list.listDate)),
    });
    // Dentro da transação: se o total gravado não bate, tudo é desfeito.
    if (created.count !== list.machines.length) {
      throw new Error(`Gravou ${created.count} de ${list.machines.length}: transação desfeita.`);
    }
  }, TX_OPTIONS);

  const after = await prisma.machineListing.count({ where: { tenantId: tenant.id } });
  if (after !== list.machines.length) throw new Error(`Conferência: o banco tem ${after}, esperado ${list.machines.length}.`);
  console.log(`✓ Gravado e conferido: ${after} máquinas.`);
}

main()
  .catch(error => {
    console.error('\n✗ Erro na importação:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
