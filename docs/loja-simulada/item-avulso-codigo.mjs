// ITEM AVULSO COM CÓDIGO (pedido do dono, 2026-10-09): o balcão digita o código e, se for Husqvarna, Briggs, Kawasaki ou Kohler, a descrição (e o preço,
// quando a loja tem a peça) vêm sozinhas; código de qualquer outro fornecedor não puxa nada e o balcão escreve descrição e preço. Nada trava a digitação.
// Manutenção leva vários itens (carburador + mangueira + filtro + junta): o formulário FICA ABERTO depois de cada "Adicionar" e volta para o código.
// O código vale digitado de qualquer jeito (com espaço, com traço, colado, minúsculo).
// Usa uma linha INVENTADA no índice dos catálogos de motor (loja simulada) e restaura no fim.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/item-avulso-codigo.mjs [tema]
import { open, check, step, finish, shot, sqlSim, clearQuote } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });

const restaurar = () => sqlSim(`DELETE FROM "OfficialPartIndex" WHERE "engineModel" = 'TESTE-MOTOR-AVULSO'`);
const rascunho = async () => {
  await page.waitForTimeout(1800);
  const corpo = await page.evaluate(async () => (await (await fetch('/api/quotes/draft', { credentials: 'include' })).json()));
  return corpo?.quote?.items ?? corpo?.items ?? [];
};

try {
  restaurar();
  sqlSim(`INSERT INTO "OfficialPartIndex" (id, source, "engineModel", "normalizedEngine", position, "partNumber", "normalizedNumber", name, "normalizedName", "updatedAt") VALUES (gen_random_uuid()::text, 'BRIGGS', 'TESTE-MOTOR-AVULSO', 'TESTEMOTORAVULSO', '', '999 111', '999111', 'JUNTA DO CABECOTE TESTE', 'junta do cabecote teste', now())`);
  await clearQuote(page);
  await page.reload();
  // A gaveta só abre com item na cesta: entra uma peça do catálogo (é o que o balcão faz de verdade) e depois vêm os avulsos.
  await page.getByPlaceholder(/Código, peça ou modelo|Peça, código ou pergunta/).fill('carburador 143RII');
  await page.getByPlaceholder(/Código, peça ou modelo|Peça, código ou pergunta/).press('Enter');
  await page.getByRole('button', { name: /^\+ Orçamento/ }).first().waitFor({ timeout: 40000 });
  await page.getByRole('button', { name: /^\+ Orçamento/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Revisar orçamento' }).click();
  const gaveta = page.getByRole('dialog').first();
  await gaveta.waitFor();
  await gaveta.getByRole('button', { name: 'Serviço ou item avulso' }).click();
  const codigo = gaveta.getByLabel('Código da peça (opcional)');
  const nome = gaveta.getByLabel('Descrição do serviço ou item');
  const preco = gaveta.getByLabel('Preço (R$)');
  const estado = gaveta.getByRole('status').filter({ hasText: /Achei|Não achei|Procurando/ });
  const adicionar = gaveta.getByRole('button', { name: 'Adicionar' });

  await step('Código Husqvarna que a loja tem: descrição e preço vêm sozinhos, e entra como peça de verdade', async () => {
    check('o campo de código é opcional e começa vazio', (await codigo.inputValue()) === '');
    await codigo.fill('506 74 42-01');
    await estado.filter({ hasText: /Achei no cadastro da loja \(Husqvarna\)/ }).waitFor({ timeout: 15000 });
    check('a descrição foi preenchida', (await nome.inputValue()).length > 3, await nome.inputValue());
    check('o preço foi preenchido (R$ 10,87, com centavos)', Math.abs(Number(await preco.inputValue()) - 10.87) < 0.01, await preco.inputValue());
    await shot(page, `${theme}-1366-avulso-codigo-achou`);
    await adicionar.click();
    const item = (await rascunho()).find(i => String(i.partNumber).replace(/\D/g, '') === '506744201');
    check('entrou com o código, a marca e o preço da loja, sem "modelo" de serviço', !!item && item.manufacturer === 'Husqvarna' && Math.abs(Number(item.unitPrice) - 10.87) < 0.01 && !item.model, JSON.stringify(item));
  });

  await step('Vários itens em sequência: o formulário fica aberto, vazio e com o cursor no código', async () => {
    check('o formulário continua aberto depois de adicionar', await codigo.isVisible());
    check('os campos voltaram vazios', (await codigo.inputValue()) === '' && (await nome.inputValue()) === '' && (await preco.inputValue()) === '');
    check('o cursor está no campo do código (dá para digitar o próximo já)', await codigo.evaluate(el => el === document.activeElement));
    check('o botão de fechar agora diz "Concluir"', (await gaveta.getByRole('button', { name: 'Concluir' }).count()) === 1);
    await shot(page, `${theme}-1366-avulso-codigo-sequencia`);
  });

  await step('O mesmo código vale de qualquer jeito: colado, com espaço, com traço', async () => {
    for (const jeito of ['506744201', '506 744 201', '506-744-201', '506 74 42-01', ' 506744201 ']) {
      await codigo.fill(jeito);
      await estado.filter({ hasText: /Achei no cadastro da loja \(Husqvarna\)/ }).waitFor({ timeout: 15000 });
      check(`"${jeito.trim()}" acha a mesma peça e o mesmo preço`, /COBERTURA/.test(await nome.inputValue()) && Math.abs(Number(await preco.inputValue()) - 10.87) < 0.01, `${await nome.inputValue()} · ${await preco.inputValue()}`);
      await codigo.fill('');
      await nome.fill('');
      await preco.fill('');
    }
    // O catálogo de motor grava "999 111" com espaço; o balcão pode digitar de outro jeito.
    for (const jeito of ['999111', '999 111', '999-111', '99-91-11']) {
      await codigo.fill(jeito);
      await estado.filter({ hasText: /Achei no catálogo Briggs & Stratton/ }).waitFor({ timeout: 15000 });
      check(`catálogo de motor: "${jeito}" acha a junta`, (await nome.inputValue()) === 'JUNTA DO CABECOTE TESTE', await nome.inputValue());
      await codigo.fill('');
      await nome.fill('');
    }
  });

  await step('Código só no catálogo de motor (Briggs): descrição vem, PREÇO fica em aberto', async () => {
    await codigo.fill('999111');
    await estado.filter({ hasText: /Achei no catálogo Briggs & Stratton/ }).waitFor({ timeout: 15000 });
    check('a descrição vem do catálogo', (await nome.inputValue()) === 'JUNTA DO CABECOTE TESTE', await nome.inputValue());
    check('o preço continua em aberto (catálogo de motor não traz preço)', (await preco.inputValue()) === '');
    check('o aviso manda escrever o preço', /Escreva o preço/.test(await estado.innerText()));
    await preco.fill('25.9');
    await adicionar.click();
    const item = (await rascunho()).find(i => String(i.partNumber) === '999111');
    check('entrou com a marca do catálogo e o preço digitado', !!item && item.manufacturer === 'Briggs & Stratton' && Number(item.unitPrice) === 25.9, JSON.stringify(item));
  });

  await step('Código de outro fornecedor: não puxa nada, tudo em aberto, e a digitação manda', async () => {
    await codigo.fill('tr-12345');
    await estado.filter({ hasText: /Não achei este código: escreva a descrição e o preço/ }).waitFor({ timeout: 15000 });
    check('descrição e preço continuam vazios', (await nome.inputValue()) === '' && (await preco.inputValue()) === '');
    await nome.fill('Tesoura de poda Tramontina');
    await preco.fill('35');
    await adicionar.click();
    const item = (await rascunho()).find(i => String(i.partNumber) === 'TR12345');
    check('entrou com o código sem traço e em maiúscula, sem marca, com o que o balcão escreveu', !!item && !item.manufacturer && item.name === 'Tesoura de poda Tramontina' && Number(item.unitPrice) === 35, JSON.stringify(item));
  });

  await step('Enter no campo do preço adiciona e já volta para o próximo código', async () => {
    await codigo.fill('VP-0042');
    await nome.fill('Mangueira de gasolina Vipeças');
    await preco.fill('8.5');
    await preco.press('Enter');
    const item = (await rascunho()).find(i => String(i.partNumber) === 'VP0042');
    check('entrou pelo teclado', !!item && Number(item.unitPrice) === 8.5, JSON.stringify(item));
    check('o cursor voltou para o código', await codigo.evaluate(el => el === document.activeElement));
  });

  await step('O que o balcão já escreveu nunca é apagado pelo que o sistema acha', async () => {
    await nome.fill('Descrição minha');
    await preco.fill('99');
    await codigo.fill('506744201');
    await estado.filter({ hasText: /Achei no cadastro da loja/ }).waitFor({ timeout: 15000 });
    check('a descrição digitada continua', (await nome.inputValue()) === 'Descrição minha');
    check('o preço digitado continua', Number(await preco.inputValue()) === 99);
    await codigo.fill('');
    check('apagar o código não mexe no que escrevi', (await nome.inputValue()) === 'Descrição minha' && Number(await preco.inputValue()) === 99);
    await nome.fill('');
    await preco.fill('');
  });

  await step('Código só com letras ou curto não consulta nada e não trava', async () => {
    for (const texto of ['TRAMONTINA', 'ab', '12']) {
      await codigo.fill(texto);
      await page.waitForTimeout(700);
      const mensagem = await estado.count();
      check(`"${texto}": ${texto === 'TRAMONTINA' ? 'sem número, o servidor não é consultado, mas diz "não achei"' : 'curto demais, nenhuma mensagem'}`, texto === 'TRAMONTINA' ? mensagem === 1 : mensagem === 0, String(mensagem));
    }
    await codigo.fill('');
    await nome.fill('Mão de obra');
    await adicionar.click();
    check('mesmo sem código dá para adicionar (serviço)', (await rascunho()).some(i => i.name === 'Mão de obra'));
  });

  await step('Concluir fecha o formulário e o orçamento tem todos os itens', async () => {
    await gaveta.getByRole('button', { name: 'Concluir' }).click();
    check('o formulário fechou e o botão de novo item voltou', (await gaveta.getByRole('button', { name: 'Serviço ou item avulso' }).count()) === 1 && !(await codigo.isVisible().catch(() => false)));
    const itens = await rascunho();
    check('6 itens: carburador do catálogo, cobertura, junta, tesoura, mangueira e mão de obra', itens.length === 6, String(itens.length));
  });

  await step('O que o cliente recebe não leva nenhum código, e a máquina não vira "Serviço / Balcão"', async () => {
    await gaveta.getByRole('button', { name: 'Ver a mensagem antes de enviar' }).click();
    const mensagem = await gaveta.getByLabel('Mensagem do WhatsApp').innerText();
    check('nenhum dos códigos digitados aparece', !/506744201|999111|TR12345|TR-12345|VP0042/.test(mensagem), mensagem.slice(0, 200));
    check('a linha "Máquina:" não mostra "Serviço / Balcão"', !/Máquina:.*Balcão/.test(mensagem), mensagem.slice(0, 160));
    check('os itens aparecem pelo nome', /CARBURADOR/i.test(mensagem) && /JUNTA DO CABECOTE TESTE/.test(mensagem) && /Tesoura de poda Tramontina/.test(mensagem) && /Mangueira de gasolina/.test(mensagem));
    await shot(page, `${theme}-1366-avulso-codigo-mensagem`);
  });
} finally {
  restaurar();
  await clearQuote(page).catch(() => {});
}

await finish(browser, errors);
