import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../config/prisma';
import { parseQuoteItems, QuoteService } from './quote.service';

// Orçamento de conserto (2026-10-09): o "arquivo" da loja é um por número de DAV/OS ("ORÇAMENTO DAV 59600.xlsx"). Salvar de novo o mesmo número
// atualiza o mesmo orçamento do mesmo atendente; sem número, cada envio arquiva um novo. Precisa de Postgres de verdade (o `npm test` recusa a produção).
const TENANT = '00000000-0000-0000-0000-0000000000f5';
const USER_A = '00000000-0000-0000-0000-0000000000f6';
const USER_B = '00000000-0000-0000-0000-0000000000f7';

async function wipe() {
  await prisma.$executeRaw`DELETE FROM "Quote" WHERE "tenantId" = ${TENANT}`;
  await prisma.$executeRaw`DELETE FROM "User" WHERE "tenantId" = ${TENANT}`;
  await prisma.$executeRaw`DELETE FROM "Tenant" WHERE "id" = ${TENANT}`;
}

const itens = (valor: number) => parseQuoteItems([
  { partNumber: 'VI25463', name: 'JOGO DE JUNTAS', quantity: 1, unitPrice: valor, leadTime: '7 dias' },
  { partNumber: 'SRV-0001', name: 'MÃO DE OBRA', quantity: 1, unitPrice: 220 },
])!;

test('mesmo número de OS atualiza o mesmo orçamento; outro atendente, outro número ou sem número arquivam novo', async t => {
  await wipe();
  t.after(wipe);
  await prisma.tenant.create({ data: { id: TENANT, name: 'Loja de teste' } });
  await prisma.user.createMany({ data: [
    { id: USER_A, tenantId: TENANT, email: 'a@teste.local', password: 'x', role: 'MECHANIC' },
    { id: USER_B, tenantId: TENANT, email: 'b@teste.local', password: 'x', role: 'MECHANIC' },
  ] });

  const opcoes = { kind: 'REPAIR' as const, docNumber: '59600', customerName: 'Cliente A' };
  const primeiro = await QuoteService.saveQuote(TENANT, USER_A, itens(20), opcoes);
  assert.equal(primeiro.kind, 'REPAIR');
  assert.equal(primeiro.docNumber, '59600');
  assert.equal(primeiro.items[0].leadTime, '7 dias', 'o prazo da linha é guardado');
  assert.equal(primeiro.items[1].leadTime, null, 'linha sem prazo próprio vale o do orçamento');

  // Mesmo número, mesmo atendente: atualiza (preço novo, cliente limpo) e não cria cópia.
  const segundo = await QuoteService.saveQuote(TENANT, USER_A, itens(25), { kind: 'REPAIR', docNumber: '59600' });
  assert.equal(segundo.id, primeiro.id);
  assert.equal(segundo.items.length, 2);
  assert.equal(segundo.items[0].unitPrice, 25);
  assert.equal(segundo.customerName, null, 'o que foi apagado na tela é apagado no arquivo');
  assert.equal(await prisma.quote.count({ where: { tenantId: TENANT, status: 'SAVED' } }), 1);

  // Outro atendente com o mesmo número não sobrescreve o do colega.
  const dele = await QuoteService.saveQuote(TENANT, USER_B, itens(30), { kind: 'REPAIR', docNumber: '59600' });
  assert.notEqual(dele.id, primeiro.id);
  // Outro número e sem número: novos.
  const outro = await QuoteService.saveQuote(TENANT, USER_A, itens(30), { kind: 'REPAIR', docNumber: '59601' });
  const semNumero1 = await QuoteService.saveQuote(TENANT, USER_A, itens(30), { kind: 'REPAIR' });
  const semNumero2 = await QuoteService.saveQuote(TENANT, USER_A, itens(30), { kind: 'REPAIR' });
  assert.equal(new Set([primeiro.id, dele.id, outro.id, semNumero1.id, semNumero2.id]).size, 5);

  // Orçamento de peças com o mesmo número digitado nunca se mistura com o conserto.
  const pecas = await QuoteService.saveQuote(TENANT, USER_A, itens(30), { kind: 'PARTS', docNumber: '59600' });
  assert.notEqual(pecas.id, primeiro.id);
  assert.equal(pecas.kind, 'PARTS');
});

test('a lista filtra por tipo e acha pelo número da OS', async t => {
  await wipe();
  t.after(wipe);
  await prisma.tenant.create({ data: { id: TENANT, name: 'Loja de teste' } });
  await prisma.user.create({ data: { id: USER_A, tenantId: TENANT, email: 'a@teste.local', password: 'x', role: 'MECHANIC' } });
  await QuoteService.saveQuote(TENANT, USER_A, itens(20), { kind: 'REPAIR', docNumber: '59600' });
  await QuoteService.saveQuote(TENANT, USER_A, itens(20), { kind: 'REPAIR', docNumber: '59642' });
  await QuoteService.saveQuote(TENANT, USER_A, itens(20), { kind: 'PARTS', customerName: 'Balcão' });

  const base = { tenantId: TENANT, take: 25, skip: 0 };
  assert.equal((await QuoteService.listSavedQuotes({ ...base })).total, 3);
  assert.equal((await QuoteService.listSavedQuotes({ ...base, kind: 'REPAIR' })).total, 2);
  assert.equal((await QuoteService.listSavedQuotes({ ...base, kind: 'PARTS' })).total, 1);
  const achado = await QuoteService.listSavedQuotes({ ...base, kind: 'REPAIR', search: '5964' });
  assert.deepEqual(achado.quotes.map(quote => quote.docNumber), ['59642']);
  assert.equal((await QuoteService.listSavedQuotes({ ...base, kind: 'REPAIR', search: '00000' })).total, 0);
});

test('dois envios da MESMA OS ao mesmo tempo (clique duplo) deixam UM orçamento só', async t => {
  await wipe();
  t.after(wipe);
  await prisma.tenant.create({ data: { id: TENANT, name: 'Loja de teste' } });
  await prisma.user.create({ data: { id: USER_A, tenantId: TENANT, email: 'a@teste.local', password: 'x', role: 'MECHANIC' } });

  const resultados = await Promise.all([1, 2, 3, 4].map(vez => QuoteService.saveQuote(TENANT, USER_A, itens(20 + vez), { kind: 'REPAIR', docNumber: '59700' })));
  assert.equal(new Set(resultados.map(quote => quote.id)).size, 1, 'todos os envios caem no mesmo orçamento');
  assert.equal(await prisma.quote.count({ where: { tenantId: TENANT, status: 'SAVED', docNumber: '59700' } }), 1);
  const guardado = await prisma.quoteItem.count({ where: { quote: { tenantId: TENANT, docNumber: '59700' } } });
  assert.equal(guardado, 2, 'as linhas não se duplicam (2 linhas, não 8)');
});

test('duas gravações da cesta (rascunho) e duas edições do orçamento arquivado ao mesmo tempo não duplicam as linhas', async t => {
  await wipe();
  t.after(wipe);
  await prisma.tenant.create({ data: { id: TENANT, name: 'Loja de teste' } });
  await prisma.user.create({ data: { id: USER_A, tenantId: TENANT, email: 'a@teste.local', password: 'x', role: 'MECHANIC' } });

  // Várias rodadas: com a corrida o defeito aparece só às vezes.
  for (let rodada = 0; rodada < 5; rodada += 1) {
    await Promise.all([1, 2, 3, 4].map(() => QuoteService.replaceDraft(TENANT, USER_A, itens(20), {})));
    const rascunho = await QuoteService.getOrCreateDraft(TENANT, USER_A);
    assert.equal(rascunho.items.length, 2, `rascunho, rodada ${rodada}: 2 linhas, não ${rascunho.items.length}`);
  }

  const arquivado = await QuoteService.saveQuote(TENANT, USER_A, itens(20), { customerName: 'Cliente' });
  for (let rodada = 0; rodada < 5; rodada += 1) {
    await Promise.all([1, 2, 3, 4].map(() => QuoteService.updateSavedQuote(TENANT, arquivado.id, itens(30), {})));
    const atual = await QuoteService.getSavedQuote(TENANT, arquivado.id);
    assert.equal(atual?.items.length, 2, `arquivado, rodada ${rodada}: 2 linhas, não ${atual?.items.length}`);
  }
});
