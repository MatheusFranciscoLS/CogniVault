// SUGESTÕES do conserto a partir do que a loja já orçou: ao digitar a descrição (ou um código que nenhum catálogo conhece) aparecem as linhas parecidas
// com valor de referência e prazo; depois de lançar uma peça aparece "costuma levar junto". Histórico INVENTADO, semeado na loja simulada e apagado no fim.
// Testa teclado (setas, Enter, Esc), o que NÃO pode mudar (Enter sem opção marcada lança o digitado), entrada hostil, servidor fora e resposta torta.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/conserto-sugestoes.mjs [tema]
import { open, check, step, finish, shot, sqlSim } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const tenant = sqlSim(`SELECT "tenantId" FROM "User" WHERE email = 'admin.e2e@cognivault.local'`);
const limpar = () => sqlSim(`DELETE FROM "Quote" WHERE "kind" = 'REPAIR' AND "docNumber" LIKE 'SUG%'`);

function semear() {
  limpar();
  sqlSim(`DO $$
  DECLARE i int; q text;
  BEGIN
    FOR i IN 0..11 LOOP
      q := gen_random_uuid()::text;
      INSERT INTO "Quote" (id, "tenantId", status, kind, "docNumber", "savedAt", "createdAt", "updatedAt", "totalItems")
        VALUES (q, '${tenant}', 'SAVED', 'REPAIR', 'SUG' || i, now() - (i || ' days')::interval, now() - (i || ' days')::interval, now(), 3);
      INSERT INTO "QuoteItem" (id, "quoteId", "sortOrder", "partNumber", "normalizedPartNumber", name, "unitPrice", "leadTime", "isService", quantity)
        VALUES (gen_random_uuid()::text, q, 0, 'SRV-' || i, 'SRV' || i, 'CARBURADOR', 200 + i, 'Pronta entrega', false, 1),
               (gen_random_uuid()::text, q, 1, 'SRV-9' || i, 'SRV9' || i, U&'M\\00C3O DE OBRA', 150, NULL, true, 1);
      IF i < 8 THEN INSERT INTO "QuoteItem" (id, "quoteId", "sortOrder", "partNumber", "normalizedPartNumber", name, "unitPrice", "leadTime", "isService", quantity)
        VALUES (gen_random_uuid()::text, q, 2, '503443201', '503443201', CASE WHEN i % 3 = 0 THEN 'FILTRO DE GASOLINA' ELSE 'FILTRO GASOLINA' END, 15, 'Pronta entrega', false, 1); END IF;
      IF i < 5 THEN INSERT INTO "QuoteItem" (id, "quoteId", "sortOrder", "partNumber", "normalizedPartNumber", name, "unitPrice", "leadTime", "isService", quantity)
        VALUES (gen_random_uuid()::text, q, 3, 'SRV-8' || i, 'SRV8' || i, 'MANGUEIRA GASOLINA', 3, 'Pronta entrega', false, 1); END IF;
      IF i < 3 THEN INSERT INTO "QuoteItem" (id, "quoteId", "sortOrder", "partNumber", "normalizedPartNumber", name, "unitPrice", "leadTime", "isService", quantity)
        VALUES (gen_random_uuid()::text, q, 4, '577484001', '577484001', 'VELA', 24, 'Pronta entrega', false, 1); END IF;
      IF i < 6 THEN INSERT INTO "QuoteItem" (id, "quoteId", "sortOrder", "partNumber", "normalizedPartNumber", name, "unitPrice", "leadTime", "isService", quantity)
        VALUES (gen_random_uuid()::text, q, 5, 'SRV-7' || i, 'SRV7' || i, U&'PIST\\00C3O', 110, '10 dias', false, 1); END IF;
      IF i < 4 THEN INSERT INTO "QuoteItem" (id, "quoteId", "sortOrder", "partNumber", "normalizedPartNumber", name, "unitPrice", "leadTime", "isService", quantity)
        VALUES (gen_random_uuid()::text, q, 6, 'VI25463', 'VI25463', 'JOGO DE JUNTAS', 20, 'Pronta entrega', false, 1); END IF;
    END LOOP;
  END $$;`);
}

async function abrirConserto() {
  sqlSim(`DELETE FROM "Quote" WHERE "status" = 'DRAFT'`);
  await page.evaluate(() => ['cognivault_repair_cart', 'cognivault_repair_draft_options', 'cognivault_quote_cart', 'cognivault_quote_draft_options'].forEach(k => localStorage.removeItem(k)));
  await page.goto(new URL('/conserto', page.url()).href);
  const editor = page.getByRole('region', { name: 'Orçamento de conserto' });
  await editor.waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  return editor;
}
const nomes = editor => editor.locator('ul > li').evaluateAll(lis => lis.filter(li => !li.getAttribute('aria-hidden')).map(li => (li.querySelector('input[type=text]')?.value ?? li.innerText).split('\n')[0].trim()));
const descricao = editor => editor.getByLabel('Descrição do serviço ou item');
const lista = editor => editor.getByRole('listbox', { name: 'Já orçado antes' });
const textosDaLista = async editor => (await lista(editor).innerText()).replace(/\s+/g, ' ');

semear();
try {
  let editor = await abrirConserto();
  const pedidos = [];
  page.on('request', request => { if (request.url().includes('/api/quotes/repair-suggestions')) pedidos.push(decodeURIComponent(request.url().split('/api/quotes/')[1])); });

  await step('Abrir a aba já acorda o histórico; sem digitar, nada aparece', async () => {
    editor = await abrirConserto();
    check('pediu o histórico ao abrir (aquecimento)', pedidos.some(pedido => pedido === 'repair-suggestions?q='), JSON.stringify(pedidos));
    check('nenhuma lista de sugestões antes de digitar', await lista(editor).count() === 0);
    check('nenhuma faixa "costuma levar junto" com a cesta vazia', await editor.getByRole('group', { name: 'Costuma levar junto' }).count() === 0);
  });

  await step('Digitar a descrição mostra as linhas já orçadas, com valor de referência e quantas vezes', async () => {
    await descricao(editor).fill('carb');
    await lista(editor).waitFor({ timeout: 8000 });
    const texto = await textosDaLista(editor);
    check('sugere "Carburador"', texto.includes('Carburador'), texto);
    check('com as vezes que foi orçado (12)', texto.includes('12 vezes'));
    check('com o prazo mais comum', texto.includes('Pronta entrega'));
    check('com valor em reais', /R\$\s?\d/.test(texto));
    await shot(page, `${theme}-1366-conserto-sugestoes`);
    check('a descrição não perdeu o que foi digitado', await descricao(editor).inputValue() === 'carb');
  });

  await step('Esc fecha; Enter SEM opção marcada lança o que foi digitado (como sempre)', async () => {
    await page.keyboard.press('Escape');
    check('Esc fecha a lista', await lista(editor).count() === 0);
    await descricao(editor).fill('');
    await descricao(editor).fill('carb');
    await lista(editor).waitFor({ timeout: 8000 });
    await editor.getByLabel('Valor unitário (R$)').fill('10');
    await descricao(editor).focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    check('a linha "carb" foi lançada com o texto digitado, não com a sugestão', (await nomes(editor)).includes('carb'), JSON.stringify(await nomes(editor)));
  });

  await step('Setas + Enter escolhem: preenche descrição, valor e prazo, e vai para o valor', async () => {
    await descricao(editor).fill('pist');
    await lista(editor).waitFor({ timeout: 8000 });
    await page.keyboard.press('ArrowDown');
    check('a opção fica marcada', (await editor.locator('[role=option][aria-selected=true]').count()) === 1);
    await page.keyboard.press('Enter');
    check('descrição preenchida com a linha escolhida', (await descricao(editor).inputValue()) === 'Pistão', await descricao(editor).inputValue());
    check('valor de referência preenchido (110)', (await editor.getByLabel('Valor unitário (R$)').inputValue()) === '110');
    check('prazo da linha vira "Encomenda" (era 10 dias)', (await editor.getByLabel('Prazo da nova linha').inputValue()) === 'ORDER' || /Encomenda/.test(await editor.getByLabel('Prazo da nova linha').innerText().catch(() => '')));
    check('o cursor foi para o valor, para conferir e dar Enter', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Valor unitário (R$)'));
    check('a lista fechou', await lista(editor).count() === 0);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    check('Enter no valor lança o Pistão', (await nomes(editor)).includes('Pistão'));
  });

  await step('Setas dão a volta e Tab segue a ordem normal com a lista aberta', async () => {
    await descricao(editor).fill('filtro');
    await lista(editor).waitFor({ timeout: 8000 });
    const total = await editor.getByRole('option').count();
    await page.keyboard.press('ArrowUp');
    check('seta para cima na primeira vai à última', (await editor.getByRole('option').nth(total - 1).getAttribute('aria-selected')) === 'true');
    await page.keyboard.press('Tab');
    check('Tab sai para a quantidade, sem escolher nada', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Quantidade') && (await descricao(editor).inputValue()) === 'filtro');
    await descricao(editor).fill('');
  });

  await step('Código que nenhum catálogo conhece (outro fornecedor) também acha o já orçado', async () => {
    await editor.getByLabel('Código da peça (opcional)').fill('VI25463');
    await lista(editor).waitFor({ timeout: 12000 });
    const texto = await textosDaLista(editor);
    check('sugere "Jogo de juntas" pelo código', texto.includes('Jogo de juntas'), texto);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    check('mantém o código digitado', (await editor.getByLabel('Código da peça (opcional)').inputValue()) === 'VI25463');
    check('preenche a descrição e o valor (20)', (await descricao(editor).inputValue()) === 'Jogo de juntas' && (await editor.getByLabel('Valor unitário (R$)').inputValue()) === '20');
    await editor.getByLabel('Código da peça (opcional)').fill('');
    await descricao(editor).fill('');
    await editor.getByLabel('Valor unitário (R$)').fill('');
  });

  await step('Mão de obra: valor de referência e SEM prazo de peça', async () => {
    await descricao(editor).fill('mao de');
    await lista(editor).waitFor({ timeout: 8000 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    check('preenche "Mão de obra" a R$ 150', (await descricao(editor).inputValue()) === 'Mão de obra' && (await editor.getByLabel('Valor unitário (R$)').inputValue()) === '150');
    check('sem prazo de peça', (await editor.getByLabel('Prazo da nova linha').inputValue()) === '');
    await editor.getByLabel('Valor unitário (R$)').press('Enter');
    await page.waitForTimeout(400);
    check('lançou a mão de obra', (await nomes(editor)).includes('Mão de obra'));
  });

  await step('"Costuma levar junto" depois de lançar uma peça', async () => {
    await descricao(editor).fill('carburador');
    await lista(editor).waitFor({ timeout: 8000 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    const faixa = editor.getByRole('group', { name: 'Costuma levar junto' });
    await faixa.waitFor({ timeout: 8000 });
    const texto = (await faixa.innerText()).replace(/\s+/g, ' ');
    check('sugere filtro de gasolina e mangueira', /Filtro gasolina/.test(texto) && /Mangueira gasolina/.test(texto), texto);
    check('sugere a vela (25% das OS), com valor de referência', /Vela/.test(texto) && /R\$\s?24/.test(texto), texto);
    check('NUNCA sugere mão de obra', !/m[aã]o de obra/i.test(texto));
    check('não sugere o que a cesta já tem (Pistão)', !/Pist[aã]o/.test(texto));
    await shot(page, `${theme}-1366-conserto-junto`);
    const antes = (await nomes(editor)).length;
    await faixa.getByRole('button', { name: /Filtro gasolina/ }).click();
    await page.waitForTimeout(600);
    const depois = await nomes(editor);
    check('um clique lança a linha', depois.length === antes + 1 && depois.some(nome => /Filtro gasolina/i.test(nome)), JSON.stringify(depois));
    const faixa2 = (await editor.getByRole('group', { name: 'Costuma levar junto' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
    check('o que já foi lançado some da faixa e o resto continua', !/Filtro gasolina/.test(faixa2) && /Mangueira/.test(faixa2), faixa2);
  });

  await step('Valor fora do costume (o zero a mais ou a menos) avisa, sem bloquear', async () => {
    const preco = editor.getByLabel('Valor unitário (R$)');
    const aviso = editor.getByText(/Costuma ser R\$/);
    await descricao(editor).fill('carburador');
    await lista(editor).waitFor({ timeout: 8000 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    check('com o valor de referência preenchido, não avisa', await aviso.count() === 0);
    await preco.fill('20');
    await aviso.waitFor({ timeout: 4000 });
    check('faltou um zero: "Costuma ser R$ 204,50 (12 vezes)"', /Costuma ser R\$\s?204,50 \(12 vezes\)/.test(await aviso.innerText()), await aviso.innerText());
    await shot(page, `${theme}-1366-conserto-aviso-valor`);
    await preco.fill('2045');
    await page.waitForTimeout(300);
    check('sobrou um zero: avisa', await aviso.count() === 1);
    for (const [valor, deve] of [['205', false], ['150', false], ['70', false], ['60', true], ['700', true], ['600', false]]) {
      await preco.fill(valor);
      await page.waitForTimeout(250);
      check(`R$ ${valor} ${deve ? 'avisa' : 'não avisa'}`, (await aviso.count() === 1) === deve);
    }
    await preco.fill('20');
    await preco.press('Enter');
    await page.waitForTimeout(500);
    check('o aviso NÃO bloqueia: a linha entra com o valor digitado', (await nomes(editor)).some(nome => /carburador/i.test(nome)));
    await descricao(editor).fill('Mão de obra');
    await preco.fill('15');
    await page.waitForTimeout(800);
    check('mão de obra a R$ 15 avisa "Costuma ser R$ 150,00"', /Costuma ser R\$\s?150,00/.test(await aviso.innerText().catch(() => '')));
    await descricao(editor).fill('Jogo de juntas');
    await preco.fill('2');
    await page.waitForTimeout(800);
    check('linha com só 4 OS no histórico não tem base para avisar', await aviso.count() === 0);
    await descricao(editor).fill('Peça que nunca foi orçada');
    await preco.fill('99999');
    await page.waitForTimeout(800);
    check('linha sem histórico não avisa', await aviso.count() === 0);
    await descricao(editor).fill('');
    await preco.fill('');
  });

  await step('Entrada estranha: nada quebra, nada aparece à toa', async () => {
    for (const texto of ["'; DROP TABLE \"Quote\"; --", '%%%', 'a'.repeat(3000), '日本語 😀', '   ', 'x', '((((']) {
      await descricao(editor).fill(texto);
      await page.waitForTimeout(500);
      check(`"${texto.slice(0, 18)}": sem lista de sugestões`, await lista(editor).count() === 0);
    }
    await descricao(editor).fill('');
    check('o editor continua de pé', await editor.isVisible());
  });

  await step('Servidor de sugestões fora do ar ou respondendo lixo: digitar e lançar continua igual', async () => {
    const errosAntes = errors.length;
    for (const [rotulo, tratar] of [
      ['500', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' })],
      ['conexão cai', route => route.abort()],
      ['resposta torta', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[null,7,{"name":42},{"name":"ok","count":"x","price":"caro"}]}' })],
      ['não é lista', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":"texto"}' })],
    ]) {
      await page.route('**/api/quotes/repair-suggestions**', tratar);
      const termo = `vel${rotulo.length}${Math.random().toString(36).slice(2, 5)}`;
      await descricao(editor).fill(termo);
      await page.waitForTimeout(900);
      check(`${rotulo}: sem lista e sem aviso de erro`, await lista(editor).count() === 0 && !(await editor.innerText()).match(/falha|erro/i));
      await editor.getByLabel('Valor unitário (R$)').fill('5');
      await descricao(editor).press('Enter');
      await page.waitForTimeout(400);
      check(`${rotulo}: Enter ainda lança "${termo}"`, (await nomes(editor)).includes(termo));
      await page.unroute('**/api/quotes/repair-suggestions**');
    }
    // o 500 e a conexão derrubada são a falha que EU injetei: esperados, não contam como erro do roteiro
    for (let i = errors.length - 1; i >= errosAntes; i--) if (/status of 500|ERR_FAILED/.test(String(errors[i]))) errors.splice(i, 1);
  });

  await step('Duas telas com o mesmo histórico e troca de ideia no meio', async () => {
    await descricao(editor).fill('vel');
    await lista(editor).waitFor({ timeout: 8000 });
    await descricao(editor).fill('retent');
    await page.waitForTimeout(800);
    check('mudar o texto no meio não deixa a lista antiga na tela', await lista(editor).count() === 0 || !(await textosDaLista(editor)).includes('Vela'));
    await descricao(editor).fill('');
    await page.waitForTimeout(400);
    check('apagar o texto fecha a lista', await lista(editor).count() === 0);
  });
} finally {
  limpar();
  sqlSim(`DELETE FROM "Quote" WHERE "status" = 'DRAFT'`);
}

await finish(browser, errors);
