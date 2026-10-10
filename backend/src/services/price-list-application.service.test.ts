import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../config/prisma';
import { parsePriceListCatalog } from '../scripts/price-list-html';
import { PriceListApprovalError, applyPriceList, buildPriceListReport } from './price-list-update.service';

// "Serve em" dos acessórios (2026-10-09, dono: "aplicação seria bom"). Precisa de Postgres de verdade; códigos inventados, tenant próprio, limpa no fim.
// Nunca rode contra o banco de produção (o `npm test` recusa).
const TENANT = '00000000-0000-0000-0000-0000000000a1';
const OTHER_TENANT = '00000000-0000-0000-0000-0000000000a2';
const source = { filename: 'teste-aplicacao.html', hash: 'c'.repeat(64) };

async function wipe() {
  await prisma.$executeRaw`DELETE FROM "CommercialImportRun" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "MasterPartSection" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "PriceListChange" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "MasterPart" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "Tenant" WHERE "id" IN (${TENANT}, ${OTHER_TENANT})`;
}

const accessory = (codigo: string, aplicacao: string | undefined) => ({ codigo, descricao: `ACESSÓRIO ${codigo}`, preco: 'R$ 92,00', ...(aplicacao === undefined ? {} : { aplicacao }) });
const catalog = (acessorios: unknown[], pecas: unknown[] = []) => parsePriceListCatalog({ pecas, acessorios, lubrificantes: [], ferramentas: [] });
const sectionOf = (tenantId: string, code: string) => prisma.masterPartSection.findMany({ where: { tenantId, normalizedNumber: code }, orderBy: { applicationKey: 'asc' } });

/** A loja já tem o acessório (92 / 0,92 = 100: preço certo), na seção ACESSÓRIOS e SEM aplicação, como entrou na primeira importação. */
async function seed() {
  await wipe();
  await prisma.tenant.createMany({ data: [{ id: TENANT, name: 'Loja de teste' }, { id: OTHER_TENANT, name: 'Outra loja de teste' }] });
  await prisma.masterPart.createMany({
    data: [
      { tenantId: TENANT, partNumber: 'ZA100', normalizedNumber: 'ZA100', name: 'sem aplicação', price: 100 },
      { tenantId: TENANT, partNumber: 'ZA200', normalizedNumber: 'ZA200', name: 'já tem aplicação', price: 100 },
      { tenantId: TENANT, partNumber: 'ZA300', normalizedNumber: 'ZA300', name: 'a lista não traz aplicação', price: 100 },
      { tenantId: OTHER_TENANT, partNumber: 'ZA100', normalizedNumber: 'ZA100', name: 'da outra loja', price: 100 },
    ],
  });
  const section = (tenantId: string, normalizedNumber: string, application: string | null) => ({
    tenantId, normalizedNumber, section: 'ACESSÓRIOS', application, applicationKey: application ? application.toUpperCase().replace(/[^A-Z0-9]/g, '') : '', reference: 'HUSQVARNA', sourceSheet: 'LISTA_HTML:acessorios',
  });
  await prisma.masterPartSection.createMany({ data: [section(TENANT, 'ZA100', null), section(TENANT, 'ZA200', 'MODELO ANTIGO'), section(TENANT, 'ZA300', null), section(OTHER_TENANT, 'ZA100', null)] });
}

test('o leitor guarda a aplicação do acessório: linhas viram " · ", "-" e vazio não são aplicação, peça de reposição continua com o modelo', () => {
  const list = catalog(
    [accessory('ZA1', 'PA1100 - 129LK / 525LK \n536LiP4  /  530iPT5'), accessory('ZA2', '-'), accessory('ZA3', '   '), accessory('ZA4', undefined), accessory('ZA5', 'x'.repeat(900))],
    [{ codigo: 'ZP1', descricao: 'PEÇA', preco: 'R$ 92,00', modelo: 'MODELO TESTE' }],
  );
  const application = (code: string) => list.items.find(item => item.normalizedNumber === code)?.applications[0].application;
  assert.equal(application('ZA1'), 'PA1100 - 129LK / 525LK · 536LiP4 / 530iPT5');
  assert.equal(application('ZA2'), null);
  assert.equal(application('ZA3'), null);
  assert.equal(application('ZA4'), null);
  assert.equal(application('ZA5')?.length, 300, 'texto enorme é cortado');
  assert.equal(application('ZP1'), 'MODELO TESTE');
});

test('o relatório conta quantos acessórios da loja serão preenchidos, e só lê', async t => {
  await seed();
  t.after(wipe);
  const list = catalog([accessory('ZA100', 'PA310 / 120i'), accessory('ZA200', 'PA9999'), accessory('ZA300', undefined)]);
  const report = await buildPriceListReport(prisma, TENANT, list);
  assert.equal(report.applications, 1, 'só o ZA100: o ZA200 já tem aplicação e o ZA300 não vem com texto');
  assert.equal((await sectionOf(TENANT, 'ZA100'))[0].application, null, 'o relatório não gravou nada');
});

test('gravar preenche SÓ o que está vazio: nunca troca a que existe, não toca em outra loja nem em preço', async t => {
  await seed();
  t.after(wipe);
  const list = catalog([accessory('ZA100', 'PA310 / 120i'), accessory('ZA200', 'PA9999'), accessory('ZA300', undefined)]);
  const result = await applyPriceList(prisma, TENANT, list, { changed: 0, added: 0, applications: 1 }, source);
  assert.equal(result.applications, 1);
  const a100 = await sectionOf(TENANT, 'ZA100');
  assert.equal(a100.length, 1, 'preencheu a seção que existia, não criou outra');
  assert.equal(a100[0].application, 'PA310 / 120i');
  assert.equal(a100[0].applicationKey, 'PA310120I');
  assert.equal((await sectionOf(TENANT, 'ZA200'))[0].application, 'MODELO ANTIGO', 'o que já tinha aplicação não é trocado');
  assert.equal((await sectionOf(TENANT, 'ZA300'))[0].application, null, 'sem texto na lista, continua vazio');
  assert.equal((await sectionOf(OTHER_TENANT, 'ZA100'))[0].application, null, 'a outra loja não muda');
  assert.equal((await prisma.masterPart.findFirst({ where: { tenantId: TENANT, normalizedNumber: 'ZA100' } }))?.price, 100, 'preço intacto');
  assert.equal((await buildPriceListReport(prisma, TENANT, list)).applications, 0, 'rodar de novo não acha mais nada a preencher');
});

test('o número de aplicações é APROVADO como os outros: diferente do relatório, recusa e não grava', async t => {
  await seed();
  t.after(wipe);
  const list = catalog([accessory('ZA100', 'PA310 / 120i')]);
  await assert.rejects(() => applyPriceList(prisma, TENANT, list, { changed: 0, added: 0, applications: 0 }, source), PriceListApprovalError);
  await assert.rejects(() => applyPriceList(prisma, TENANT, list, { changed: 0, added: 0, applications: 5 }, source), PriceListApprovalError);
  assert.equal((await sectionOf(TENANT, 'ZA100'))[0].application, null, 'recusou sem gravar nada');
});

test('lista igual no preço mas com aplicação a preencher AINDA grava (não vira "nada a fazer")', async t => {
  await seed();
  t.after(wipe);
  const list = catalog([accessory('ZA100', 'PA310')]);
  const report = await buildPriceListReport(prisma, TENANT, list);
  assert.deepEqual([report.changed, report.added, report.applications], [0, 0, 1]);
  const result = await applyPriceList(prisma, TENANT, list, { changed: 0, added: 0, applications: 1 }, source);
  assert.equal(result.applications, 1);
  assert.equal((await sectionOf(TENANT, 'ZA100'))[0].application, 'PA310');
});

test('não preenche se já existe linha da mesma seção com essa aplicação (evita duplicata na chave única)', async t => {
  await seed();
  t.after(wipe);
  await prisma.masterPartSection.create({ data: { tenantId: TENANT, normalizedNumber: 'ZA100', section: 'ACESSÓRIOS', application: 'PA310', applicationKey: 'PA310', sourceSheet: 'x' } });
  const list = catalog([accessory('ZA100', 'PA310')]);
  assert.equal((await buildPriceListReport(prisma, TENANT, list)).applications, 0, 'ficaria duplicada: fora da conta');
  const result = await applyPriceList(prisma, TENANT, list, { changed: 0, added: 0, applications: 0 }, source);
  assert.equal(result.applications, 0);
  assert.equal((await sectionOf(TENANT, 'ZA100')).length, 2, 'nada foi criado nem trocado');
});

test('código novo de acessório já entra com a aplicação', async t => {
  await seed();
  t.after(wipe);
  const list = catalog([accessory('ZA777', 'PA1100 - 129LK')]);
  const result = await applyPriceList(prisma, TENANT, list, { changed: 0, added: 1, applications: 0 }, source);
  assert.equal(result.added, 1);
  assert.equal((await sectionOf(TENANT, 'ZA777'))[0].application, 'PA1100 - 129LK');
});
