// MAIS ORÇADAS NO CONSERTO (Negócio, só administrador): o que mais se orça, por período, para guiar o estoque. Histórico INVENTADO, semeado e apagado no fim.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/mais-orcadas.mjs [tema]
import { open, check, step, finish, shot, sqlSim, BASE } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const tenant = sqlSim(`SELECT "tenantId" FROM "User" WHERE email = 'admin.e2e@cognivault.local'`);
const limpar = () => sqlSim(`DELETE FROM "Quote" WHERE "kind" = 'REPAIR' AND "docNumber" LIKE 'TOP%'`);

// 10 OS recentes (CARBURADOR em todas, FILTRO GASOLINA em 6, mão de obra em todas) e 10 antigas de mais de um ano (VELA em todas, FILTRO DE GASOLINA em 8).
function semear() {
  limpar();
  sqlSim(`DO $$
  DECLARE i int; q text;
  BEGIN
    FOR i IN 0..9 LOOP
      q := gen_random_uuid()::text;
      INSERT INTO "Quote" (id, "tenantId", status, kind, "docNumber", "savedAt", "createdAt", "updatedAt", "totalItems") VALUES (q, '${tenant}', 'SAVED', 'REPAIR', 'TOPR' || i, now() - ((i * 6) || ' days')::interval, now() - ((i * 6) || ' days')::interval, now(), 3);
      INSERT INTO "QuoteItem" (id, "quoteId", "sortOrder", "partNumber", "normalizedPartNumber", name, "unitPrice", "leadTime", "isService", quantity) VALUES
        (gen_random_uuid()::text, q, 0, 'SRV-' || i, 'SRV' || i, 'CARBURADOR', 300, 'Pronta entrega', false, 1),
        (gen_random_uuid()::text, q, 1, 'SRV-9' || i, 'SRV9' || i, 'MAO DE OBRA', 150, NULL, true, 1);
      IF i < 6 THEN INSERT INTO "QuoteItem" (id, "quoteId", "sortOrder", "partNumber", "normalizedPartNumber", name, "unitPrice", "leadTime", "isService", quantity) VALUES (gen_random_uuid()::text, q, 2, 'SRV-8' || i, 'SRV8' || i, 'FILTRO GASOLINA', 20, 'Pronta entrega', false, 1); END IF;
    END LOOP;
    FOR i IN 0..9 LOOP
      q := gen_random_uuid()::text;
      INSERT INTO "Quote" (id, "tenantId", status, kind, "docNumber", "savedAt", "createdAt", "updatedAt", "totalItems") VALUES (q, '${tenant}', 'SAVED', 'REPAIR', 'TOPA' || i, now() - ((400 + i * 10) || ' days')::interval, now() - ((400 + i * 10) || ' days')::interval, now(), 3);
      INSERT INTO "QuoteItem" (id, "quoteId", "sortOrder", "partNumber", "normalizedPartNumber", name, "unitPrice", "leadTime", "isService", quantity) VALUES
        (gen_random_uuid()::text, q, 0, 'SRV-7' || i, 'SRV7' || i, 'VELA', 10, 'Pronta entrega', false, 1),
        (gen_random_uuid()::text, q, 1, 'SRV-6' || i, 'SRV6' || i, 'MAO DE OBRA', 100, NULL, true, 1);
      IF i < 8 THEN INSERT INTO "QuoteItem" (id, "quoteId", "sortOrder", "partNumber", "normalizedPartNumber", name, "unitPrice", "leadTime", "isService", quantity) VALUES (gen_random_uuid()::text, q, 2, 'SRV-5' || i, 'SRV5' || i, 'FILTRO DE GASOLINA', 12, 'Pronta entrega', false, 1); END IF;
    END LOOP;
  END $$;`);
}

try {
  semear();
  // O índice do servidor vale 60 s e se atualiza por trás (as sugestões precisam de resposta imediata); o semeio por SQL não passa pelo serviço que o marca como velho,
  // então espera o índice enxergar as OS semeadas (até 75 s; na prática, só quando outro roteiro o carregou há menos de 1 minuto).
  for (let i = 0; i < 16; i += 1) {
    const achou = await page.evaluate(async () => (await (await fetch('/api/admin/repair-top?months=all&limit=50', { credentials: 'include' })).json()).items.some(item => /carburador/i.test(item.name) && item.orders >= 10));
    if (achou) break;
    await page.waitForTimeout(5000);
  }
  await page.goto(BASE + '/administracao/negocio?aba=demanda');
  const titulo = page.getByRole('heading', { name: 'Mais orçadas no conserto' });
  await titulo.waitFor({ timeout: 30000 });
  const cartao = titulo.locator('xpath=ancestor::div[contains(@class,"rounded-card")][1]');
  await cartao.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const texto = async () => (await cartao.innerText()).replace(/\s+/g, ' ');
  const periodo = nome => cartao.getByRole('button', { name: nome, exact: true });

  await step('Por padrão: os últimos 12 meses, só peça, com valor e prazo do período', async () => {
    const t = await texto();
    check('o período padrão é 12 meses (marcado)', (await periodo('12 meses').getAttribute('aria-pressed')) === 'true');
    check('conta as OS do período (as 10 recentes, ao menos)', /(\d+) OS no período/.test(t) && Number(/(\d+) OS no período/.exec(t)[1]) >= 10, t.slice(0, 160));
    check('"Carburador" e "Filtro gasolina" aparecem', /Carburador/.test(t) && /Filtro (de )?gasolina/.test(t));
    check('o valor de referência do carburador é R$ 300,00', /Carburador\s+\d+\s+\d+%\s+R\$\s?300,00/.test(t), t.slice(0, 300));
    check('vela (só orçada há mais de um ano) NÃO aparece', !/\bVela\b/.test(t));
    check('mão de obra NUNCA aparece', !/m[aã]o de obra/i.test(t));
    await shot(page, `${theme}-1366-mais-orcadas`);
  });

  await step('Trocar o período muda a lista e a conta', async () => {
    await periodo('Tudo').click();
    await page.waitForTimeout(1500);
    const t = await texto();
    check('"Tudo" marca o botão', (await periodo('Tudo').getAttribute('aria-pressed')) === 'true' && (await periodo('12 meses').getAttribute('aria-pressed')) === 'false');
    check('agora a vela aparece', /\bVela\b/.test(t), t.slice(0, 300));
    check('o filtro junta as duas grafias (14 OS)', /Filtro (de )?gasolina\s+14\b/.test(t), t.slice(0, 300));
    await periodo('3 meses').click();
    await page.waitForTimeout(1500);
    const t3 = await texto();
    check('"3 meses" tem só as OS recentes e sem a vela', !/\bVela\b/.test(t3) && /Carburador/.test(t3));
  });

  await step('Só o administrador chama a rota: sem login 401, balcão 403, lixo no parâmetro não quebra', async () => {
    const sem = await fetch(BASE + '/api/admin/repair-top?months=12');
    check('sem login: 401', sem.status === 401, String(sem.status));
    const api = p => page.evaluate(async url => { const r = await fetch(url, { credentials: 'include' }); return { status: r.status, body: await r.json().catch(() => null) }; }, p);
    for (const lixo of ['abc', '-5', '99999', '1e9', "'; DROP TABLE", '']) {
      const r = await api(`/api/admin/repair-top?months=${encodeURIComponent(lixo)}&limit=${encodeURIComponent(lixo)}`);
      check(`months="${lixo}": 200 com lista`, r.status === 200 && Array.isArray(r.body?.items), `${r.status}`);
    }
    const balcao = await browser.newContext();
    const cabecalhos = { Origin: BASE };
    const entrada = await balcao.request.post(BASE + '/api/login', { data: { email: 'mecanico.e2e@cognivault.local', password: 'CogniVault-E2E-2026!' }, headers: cabecalhos });
    const negado = await balcao.request.get(BASE + '/api/admin/repair-top?months=12', { headers: cabecalhos });
    check('login do balcão funcionou e a rota responde 403', entrada.ok() && negado.status() === 403, `${entrada.status()} ${negado.status()}`);
    await balcao.close();
  });

  await step('Resposta torta ou servidor fora: o painel do dono continua de pé', async () => {
    for (const tratar of [route => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }), route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[null,1,{"name":5}],"totalOrders":"x"}' })]) {
      await page.route('**/api/admin/repair-top*', tratar);
      await page.reload();
      await page.getByRole('heading', { name: 'Buscas sem resultado' }).waitFor({ timeout: 30000 });
      check('a tela de Negócio abriu inteira e sem o cartão quebrado', await page.getByRole('heading', { name: 'Buscas sem resultado' }).count() === 1);
      await page.unroute('**/api/admin/repair-top*');
    }
    for (let i = errors.length - 1; i >= 0; i--) if (/status of 500/.test(errors[i])) errors.splice(i, 1);
  });
} finally {
  limpar();
}

await finish(browser, errors);
