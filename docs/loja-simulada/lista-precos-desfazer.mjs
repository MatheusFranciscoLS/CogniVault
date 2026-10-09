// DESFAZER a última atualização da lista de preços (Negócio) e o aviso de mudanças grandes. Arquivo INVENTADO, loja SIMULADA; restaura tudo no fim.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/lista-precos-desfazer.mjs [tema]
import fs from 'node:fs';
import path from 'node:path';
import { open, check, step, finish, shot, sqlSim, confirmar, OUT } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const consumidor = valor => `R$ ${valor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

const base = sqlSim(`SELECT "normalizedNumber", "partNumber", "price" FROM "MasterPart" WHERE "price" > 10 AND "price" < 2000 AND "normalizedNumber" ~ '^[0-9]{9}$' ORDER BY "normalizedNumber" LIMIT 6`)
  .trim().split(/\r?\n/).map(linha => linha.split('|'));
const original = new Map(base.map(([n, , preco]) => [n, Number(preco)]));
const [a, b, c, d] = base;
// a, b: +10% · c: +150% (mudança grande) · d: igual · ZZUND001: código novo
const pecas = [
  { codigo: a[1], preco: consumidor(Number(a[2]) * 1.1 * 0.92) },
  { codigo: b[1], preco: consumidor(Number(b[2]) * 1.1 * 0.92) },
  { codigo: c[1], preco: consumidor(Number(c[2]) * 2.5 * 0.92) },
  { codigo: d[1], preco: consumidor(Number(d[2]) * 0.92) },
  { codigo: 'ZZUND001', preco: 'R$ 46,00' },
].map(p => ({ ...p, descricao: `PEÇA ${p.codigo}`, modelo: 'MODELO TESTE' }));
const pasta = path.join(OUT, 'lista-teste');
fs.mkdirSync(pasta, { recursive: true });
const arquivo = path.join(pasta, 'lista-desfazer.html');
fs.writeFileSync(arquivo, `<!DOCTYPE html><html><body><script id="catalogData" type="application/json">${JSON.stringify({ produtos: [], pecas, acessorios: [], lubrificantes: [], ferramentas: [] })}</script></body></html>`);

const restaurar = () => {
  sqlSim(`DELETE FROM "PriceListChange"`);
  sqlSim(`DELETE FROM "MasterPartSection" WHERE "normalizedNumber" LIKE 'ZZUND%'`);
  sqlSim(`DELETE FROM "MasterPart" WHERE "normalizedNumber" LIKE 'ZZUND%'`);
  for (const [n, preco] of original) sqlSim(`UPDATE "MasterPart" SET "price" = ${preco} WHERE "normalizedNumber" = '${n}'`);
  sqlSim(`DELETE FROM "CommercialImportRun" WHERE "sourceFilename" = 'lista-desfazer.html'`);
};
const preco = n => Number(sqlSim(`SELECT "price" FROM "MasterPart" WHERE "normalizedNumber" = '${n}'`).trim());
const existe = n => Number(sqlSim(`SELECT COUNT(*) FROM "MasterPart" WHERE "normalizedNumber" = '${n}'`).trim()) > 0;
const perto = (x, y) => Math.abs(x - y) < 0.02;

try {
  restaurar();
  await page.goto('http://127.0.0.1:5173/administracao/negocio');
  const cartao = page.getByRole('region', { name: 'Atualizar a lista de preços' });
  await cartao.waitFor({ timeout: 30000 });
  await cartao.scrollIntoViewIfNeeded();

  await step('Sem atualização anterior, não há "Desfazer"', async () => {
    check('nenhuma linha de última atualização', (await cartao.getByText('Última atualização:').count()) === 0);
  });

  await step('Mudança grande aparece como aviso no relatório e na confirmação', async () => {
    await cartao.locator('#price-list-file').setInputFiles(arquivo);
    await cartao.getByRole('button', { name: 'Gravar na loja' }).waitFor({ timeout: 60000 });
    const texto = (await cartao.innerText()).replace(/\s+/g, ' ');
    check('o relatório avisa de 1 preço que muda muito', /1 preço muda para mais que o dobro ou menos que a metade/.test(texto), texto.slice(0, 300));
    check('3 preços mudam e 1 código é novo', /3\s*Preços que mudam/.test(texto) && /1\s*Códigos novos/.test(texto));
    await shot(page, `${theme}-1366-lista-aviso-grande`);
    await cartao.getByRole('button', { name: 'Gravar na loja' }).click();
    const dialogo = page.getByRole('alertdialog');
    await dialogo.waitFor();
    check('o título da confirmação lembra da mudança grande', /1 preço muda muito/.test(await dialogo.innerText()), (await dialogo.innerText()).slice(0, 120));
    await dialogo.getByRole('button', { name: 'Gravar' }).click();
    await cartao.getByText(/Pronto:/).waitFor({ timeout: 60000 });
    check('o preço mudou no banco', perto(preco(a[0]), Number(a[2]) * 1.1) && existe('ZZUND001'));
  });

  await step('Depois de gravar aparece a última atualização com "Desfazer"', async () => {
    const linha = cartao.getByText('Última atualização:');
    await linha.waitFor({ timeout: 20000 });
    const texto = (await cartao.innerText()).replace(/\s+/g, ' ');
    check('mostra o arquivo, 3 preços e 1 código novo', /lista-desfazer\.html/.test(texto) && /3 preços, 1 códigos novos/.test(texto), texto.slice(0, 300));
    await shot(page, `${theme}-1366-lista-desfazer`);
  });

  await step('Desfazer devolve o que dá e deixa como está o que foi ajustado depois', async () => {
    // O dono ajusta um preço à mão DEPOIS da atualização: o desfazer não pode passar por cima.
    sqlSim(`UPDATE "MasterPart" SET "price" = 999 WHERE "normalizedNumber" = '${b[0]}'`);
    await page.reload();
    const cartao2 = page.getByRole('region', { name: 'Atualizar a lista de preços' });
    await cartao2.getByText('Última atualização:').waitFor({ timeout: 30000 });
    await cartao2.getByRole('button', { name: 'Desfazer' }).click();
    const dialogo = page.getByRole('alertdialog');
    await dialogo.waitFor();
    const texto = (await dialogo.innerText()).replace(/\s+/g, ' ');
    check('a confirmação diz 2 preços voltam, 1 código sai e 1 fica como está', /2 peças/.test(texto) && /1 códigos/.test(texto) && /1 ficam como estão/.test(texto), texto);
    await shot(page, `${theme}-1366-lista-desfazer-confirmar`);
    await dialogo.getByRole('button', { name: 'Desfazer' }).click();
    await cartao2.getByText(/Desfeito:/).waitFor({ timeout: 60000 });
    check('a mensagem fala dos números', /2 preços voltaram ao valor de antes e 1 códigos novos saíram; 1 ficaram como estão/.test(await cartao2.innerText()), (await cartao2.innerText()).slice(0, 200));
    check('o preço do a voltou', perto(preco(a[0]), original.get(a[0])), `${preco(a[0])} vs ${original.get(a[0])}`);
    check('o preço do c (mudança grande) voltou', perto(preco(c[0]), original.get(c[0])));
    check('o ajuste manual do b continua (999)', perto(preco(b[0]), 999));
    check('o código criado saiu', !existe('ZZUND001'));
    check('o que a atualização não tocou continua igual', perto(preco(d[0]), original.get(d[0])));
    check('a linha de última atualização some (só se desfaz uma vez)', (await cartao2.getByText('Última atualização:').count()) === 0);
  });

  await step('A rota recusa quem não está logado e pedido sem números', async () => {
    const baseUrl = 'http://127.0.0.1:5173/api/admin/price-list';
    const cab = { Origin: 'http://127.0.0.1:5173' };
    check('última sem login: 401', (await fetch(baseUrl + '/last', { headers: cab })).status === 401);
    check('desfazer sem login: 401', (await fetch(baseUrl + '/undo?runId=x&prices=0&added=0', { method: 'POST', headers: cab })).status === 401);
    const semNumeros = await page.request.post(baseUrl + '/undo', { headers: cab });
    check('desfazer sem números: 400', semNumeros.status() === 400, String(semNumeros.status()));
    const semAtualizacao = await page.request.post(baseUrl + '/undo?runId=00000000-0000-0000-0000-000000000000&prices=0&added=0', { headers: cab });
    check('desfazer sem atualização guardada: 409, nunca 500', semAtualizacao.status() === 409, String(semAtualizacao.status()));
  });
} finally {
  restaurar();
}

await finish(browser, errors);
