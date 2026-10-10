// RODADA 2 de auditoria (lógica): REDE LENTA (não caída). Gravar a lista de preços com a resposta demorando (clique duplo, recarregar no meio) e a busca
// com a resposta antiga chegando DEPOIS da nova. Arquivo INVENTADO e loja SIMULADA; restaura tudo no fim.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/rodada2-rede-lenta.mjs [tema]
import fs from 'node:fs';
import path from 'node:path';
import { open, check, step, finish, sqlSim, confirmar, OUT, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const linhas = sqlSim(`SELECT "normalizedNumber", "partNumber", COALESCE("price",0) FROM "MasterPart" WHERE "price" > 5 AND "normalizedNumber" ~ '^[0-9]{9}$' ORDER BY "normalizedNumber" LIMIT 60`)
  .trim().split('\n').map(linha => linha.split('|'));
const original = new Map(linhas.map(([normalizado, , preco]) => [normalizado, Number(preco)]));
const consumidor = valor => `R$ ${valor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const mudam = linhas.slice(0, 6);
const iguais = linhas.slice(6);
const pecas = [
  ...mudam.map(([, codigo, preco]) => ({ codigo, descricao: `PEÇA TESTE ${codigo}`, preco: consumidor(Number(preco) * 1.1 * 0.92), modelo: 'MODELO TESTE' })),
  ...iguais.map(([, codigo, preco]) => ({ codigo, descricao: `PEÇA TESTE ${codigo}`, preco: consumidor(Number(preco) * 0.92), modelo: 'MODELO TESTE' })),
  { codigo: 'ZZLENTO001', descricao: 'PEÇA NOVA UM', preco: 'R$ 46,00', modelo: 'MODELO NOVO' },
  { codigo: 'ZZLENTO002', descricao: 'PEÇA NOVA DOIS', preco: 'R$ 92,00', modelo: 'MODELO NOVO' },
];
const pasta = path.join(OUT, 'lista-lenta');
fs.mkdirSync(pasta, { recursive: true });
const arquivo = path.join(pasta, 'lista-lenta.html');
fs.writeFileSync(arquivo, `<!DOCTYPE html><html><body><script id="catalogData" type="application/json">${JSON.stringify({ produtos: [], pecas, acessorios: [], lubrificantes: [], ferramentas: [] })}</script></body></html>`);

const restaurar = () => {
  sqlSim(`DELETE FROM "MasterPartSection" WHERE "normalizedNumber" LIKE 'ZZLENTO%'`);
  sqlSim(`DELETE FROM "MasterPart" WHERE "normalizedNumber" LIKE 'ZZLENTO%'`);
  for (const [normalizado, preco] of original) sqlSim(`UPDATE "MasterPart" SET "price" = ${preco} WHERE "normalizedNumber" = '${normalizado}'`);
  sqlSim(`DELETE FROM "CommercialImportRun" WHERE "sourceFilename" = 'lista-lenta.html'`);
};
const preco = normalizado => Number(sqlSim(`SELECT "price" FROM "MasterPart" WHERE "normalizedNumber" = '${normalizado}'`).trim());
const execucoes = () => Number(sqlSim(`SELECT COUNT(*) FROM "CommercialImportRun" WHERE "sourceFilename" = 'lista-lenta.html'`).trim());
const atualizadas = () => mudam.filter(([normalizado, , antes]) => Math.abs(preco(normalizado) - Number(antes) * 1.1) < 0.02).length;
const novas = () => Number(sqlSim(`SELECT COUNT(*) FROM "MasterPart" WHERE "normalizedNumber" LIKE 'ZZLENTO%'`).trim());

/** A resposta do servidor só chega ao navegador depois de `ms`: o servidor JÁ terminou, o balcão ainda espera. */
const respostaLenta = async (padrao, ms, contador) => page.route(padrao, async rota => {
  contador.n += 1;
  const resposta = await rota.fetch();
  await new Promise(resolver => setTimeout(resolver, ms));
  await rota.fulfill({ response: resposta }).catch(() => undefined);
});

try {
  restaurar();
  await page.goto('http://127.0.0.1:5173/administracao/negocio?aba=lista');
  const cartao = page.getByRole('region', { name: 'Atualizar a lista de preços' });
  await cartao.waitFor({ timeout: 30000 });
  await cartao.scrollIntoViewIfNeeded();

  await step('Gravar com a resposta demorando 6 s: clique duplo não grava duas vezes', async () => {
    const pedidos = { n: 0 };
    await cartao.locator('#price-list-file').setInputFiles(arquivo);
    await cartao.getByRole('button', { name: 'Gravar na loja' }).waitFor({ timeout: 60000 });
    await respostaLenta('**/api/admin/price-list/apply*', 6000, pedidos);
    await cartao.getByRole('button', { name: 'Gravar na loja' }).click();
    await confirmar(page, 'Gravar');
    await page.waitForTimeout(800);
    const botao = cartao.getByRole('button', { name: /Gravar na loja|Gravando/ });
    const bloqueado = (await botao.count()) === 0 || await botao.first().isDisabled();
    check('durante a espera o botão de gravar fica bloqueado (ou some)', bloqueado);
    if (!bloqueado) { await botao.first().click({ force: true }).catch(() => undefined); await confirmar(page, 'Gravar').catch(() => undefined); }
    await cartao.getByText(/Pronto:/).waitFor({ timeout: 60000 });
    check('só UM pedido de gravação saiu', pedidos.n === 1, String(pedidos.n));
    check('os 6 preços mudaram uma vez só (+10%, nunca +21%)', atualizadas() === 6, String(atualizadas()));
    check('os 2 códigos novos entraram', novas() === 2);
    check('uma única importação registrada', execucoes() === 1, String(execucoes()));
    await page.unroute('**/api/admin/price-list/apply*');
  });

  await step('Recarregar a página enquanto a gravação demora: nada fica pela metade e a tela conta o que houve', async () => {
    restaurar();
    await page.goto('http://127.0.0.1:5173/administracao/negocio?aba=lista');
    await cartao.waitFor({ timeout: 30000 });
    await cartao.locator('#price-list-file').setInputFiles(arquivo);
    await cartao.getByRole('button', { name: 'Gravar na loja' }).waitFor({ timeout: 60000 });
    const pedidos = { n: 0 };
    await respostaLenta('**/api/admin/price-list/apply*', 8000, pedidos);
    await cartao.getByRole('button', { name: 'Gravar na loja' }).click();
    await confirmar(page, 'Gravar');
    await page.waitForTimeout(1500);
    await page.reload();
    await cartao.waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    check('tudo ou nada: ou os 6 preços e os 2 códigos, ou nenhum', (atualizadas() === 6 && novas() === 2 && execucoes() === 1) || (atualizadas() === 0 && novas() === 0 && execucoes() === 0), `${atualizadas()} preços, ${novas()} novos, ${execucoes()} execuções`);
    const texto = (await cartao.innerText()).replace(/\s+/g, ' ');
    const gravou = atualizadas() === 6;
    check('a tela diz a verdade sobre a última atualização', gravou ? /Última atualização/.test(texto) && /lista-lenta\.html/.test(texto) : !/lista-lenta\.html/.test(texto), texto.slice(0, 200));
    await cartao.locator('#price-list-file').setInputFiles(arquivo);
    await page.waitForTimeout(3000);
    const depois = (await cartao.innerText()).replace(/\s+/g, ' ');
    check(gravou ? 'escolher o mesmo arquivo de novo diz que a loja já está igual' : 'escolher o arquivo de novo mostra o relatório para gravar', gravou ? /A loja já está igual/.test(depois) : /Gravar na loja/.test(depois), depois.slice(0, 160));
    await page.unroute('**/api/admin/price-list/apply*');
  });

  await step('Busca: a resposta ANTIGA que chega depois não cobre a busca nova', async () => {
    await page.goto('http://127.0.0.1:5173/atendimento');
    const campo = page.getByPlaceholder(SEARCH);
    await campo.waitFor({ timeout: 30000 });
    // "filtro" demora 7 s para responder; "vela" responde na hora
    await page.route('**/api/search/**', async rota => {
      const consulta = decodeURIComponent(new URL(rota.request().url()).searchParams.get('q') ?? '').toLowerCase();
      if (consulta.includes('filtro')) await new Promise(resolver => setTimeout(resolver, 7000));
      await rota.continue().catch(() => undefined);
    });
    await campo.fill('filtro de ar');
    await campo.press('Enter');
    await page.waitForTimeout(600);
    await campo.fill('vela');
    await campo.press('Enter');
    await page.waitForTimeout(2500);
    const logoDepois = (await page.locator('main').innerText()).toLowerCase();
    await page.waitForTimeout(8000);
    const fim = (await page.locator('main').innerText()).toLowerCase();
    check('a busca nova (vela) aparece primeiro', /vela/.test(logoDepois));
    check('7 s depois, quando a antiga responde, a tela continua sendo a da vela', /vela/.test(fim) && !/filtro de ar\s*(\n|$)/.test(fim.split('resultado')[0] ?? ''), fim.slice(0, 160).replace(/\s+/g, ' '));
    check('o campo continua com o que o balcão digitou por último', await campo.inputValue() === 'vela');
    await page.unroute('**/api/search/**');
  });
} finally {
  restaurar();
}

await finish(browser, errors);
