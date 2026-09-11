import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const COMMERCIAL_PRICE_DIVISOR = 0.92;

function resolveExcelPath(): string {
  const fileArg = process.argv.slice(2).find(argument => !argument.startsWith('--'));
  const configured = fileArg || process.env.PRICE_LIST_PATH || '../Lista de Preços_Julho_2026_V2.xlsm';
  return path.resolve(process.cwd(), configured);
}

async function fileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function resolveTenant(): Promise<{ id: string; name: string }> {
  const tenantArg = process.argv.find(argument => argument.startsWith('--tenant='));
  const tenantNameArg = process.argv.find(argument => argument.startsWith('--tenant-name='));

  if (tenantArg) {
    const id = tenantArg.slice('--tenant='.length).trim();
    const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!tenant) throw new Error(`Tenant ${id} não encontrado.`);
    return tenant;
  }

  if (tenantNameArg) {
    const name = tenantNameArg.slice('--tenant-name='.length).trim();
    const tenant = await prisma.tenant.findFirst({ where: { name }, select: { id: true, name: true } });
    if (!tenant) throw new Error(`Tenant "${name}" não encontrado.`);
    return tenant;
  }

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  if (tenants.length === 1) return tenants[0];
  if (!tenants.length) throw new Error('Nenhum tenant encontrado no banco.');
  throw new Error(`Existem ${tenants.length} tenants. Use --tenant=<uuid> ou --tenant-name="Nome".`);
}

function parsePtBrInteger(output: string, label: string): number {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = output.match(new RegExp(`${escaped}\\s*([0-9.]+)`));
  return match ? Number(match[1].replace(/\./g, '')) || 0 : 0;
}

async function runCoreImporter(): Promise<{ code: number; stdout: string; stderr: string }> {
  const tsxCli = require.resolve('tsx/cli');
  const coreScript = path.resolve(__dirname, 'import-price-list.ts');
  const args = process.argv.slice(2);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, coreScript, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', chunk => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });
    child.once('error', reject);
    child.once('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const help = process.argv.includes('--help');

  if (dryRun || help) {
    const result = await runCoreImporter();
    if (result.code !== 0) process.exitCode = result.code;
    return;
  }

  const filePath = resolveExcelPath();
  const tenant = await resolveTenant();
  const sourceHash = await fileSha256(filePath);

  console.log(`Versão da lista: SHA-256 ${sourceHash.slice(0, 16)}…`);

  const importRun = await prisma.commercialImportRun.create({
    data: {
      tenantId: tenant.id,
      sourceFilename: path.basename(filePath),
      sourceHash,
      priceDivisor: COMMERCIAL_PRICE_DIVISOR,
      status: 'RUNNING',
    },
    select: { id: true },
  });

  try {
    const result = await runCoreImporter();
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout || `Processo finalizado com código ${result.code}`).trim();
      throw new Error(detail.slice(-1200));
    }

    const [masterCount, sectionCount] = await Promise.all([
      prisma.masterPart.count({ where: { tenantId: tenant.id } }),
      prisma.masterPartSection.count({ where: { tenantId: tenant.id } }),
    ]);
    const occurrenceCount = parsePtBrInteger(result.stdout, 'Linhas comerciais válidas:');

    await prisma.commercialImportRun.update({
      where: { id: importRun.id },
      data: {
        occurrenceCount,
        masterCount,
        sectionCount,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    console.log(`Histórico da importação registrado: ${importRun.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.commercialImportRun.update({
      where: { id: importRun.id },
      data: {
        status: 'FAILED',
        error: message.slice(0, 1200),
        completedAt: new Date(),
      },
    }).catch(() => undefined);
    throw error;
  }
}

main()
  .catch(error => {
    console.error('\n✗ Falha ao registrar/importar a lista comercial:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
