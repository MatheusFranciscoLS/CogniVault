// PREÇO ZERO NÃO É PREÇO (2026-10-10): peça do cadastro com R$ 0,00 (há 14 na produção) aparecia na busca como "R$ 0,00" com o "+ Orçamento" ligado, e o orçamento podia
// sair para o cliente com a peça de graça. Agora o servidor entrega `null` quando o preço da loja é 0 ou negativo e a tela mostra "Consultar no Parceiro". Peça barata de
// verdade (R$ 0,12, porca) continua com o preço. Cria três peças de teste na loja simulada e apaga no fim.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/preco-zero.mjs [tema]
import { open, check, step, finish, shot, sqlSim, BASE, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light', width: 1366, height: 768 });
const CODIGOS = ['ZZ0PRECO01', 'ZZ1CENTAVO1', 'ZZNEGATIVO1'];
const apagar = () => sqlSim(`delete from "MasterPart" where "partNumber" in (${CODIGOS.map(c => `'${c}'`).join(',')})`);
const criar = (codigo, nome, preco) => sqlSim(`insert into "MasterPart" (id,"tenantId","partNumber","normalizedNumber",name,description,price,category,brand,"updatedAt") select md5(random()::text),"tenantId",'${codigo}','${codigo}','${nome}',description,${preco},category,brand,now() from "MasterPart" limit 1`);

try {
  apagar();
  criar('ZZ0PRECO01', 'PLACA DE TESTE SEM PRECO', 0);
  criar('ZZ1CENTAVO1', 'PORCA DE TESTE BARATA', 0.12);
  criar('ZZNEGATIVO1', 'PECA DE TESTE NEGATIVA', -3);

  await page.goto(BASE + '/atendimento');
  const campo = page.getByPlaceholder(SEARCH);
  await campo.waitFor({ timeout: 30000 });
  const linhaDe = codigo => page.locator('article', { has: page.locator(`[aria-label="Copiar código ${codigo}"]`) });

  await step('A API não devolve zero nem negativo como preço', async () => {
    const r = await page.evaluate(async codes => {
      const resp = await fetch('/api/master-parts/prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ codes }) });
      return resp.json();
    }, CODIGOS);
    const preco = c => r.prices?.[c]?.price;
    check('R$ 0,00 vira null', preco('ZZ0PRECO01') === null, String(preco('ZZ0PRECO01')));
    check('preço negativo vira null', preco('ZZNEGATIVO1') === null, String(preco('ZZNEGATIVO1')));
    check('R$ 0,12 continua R$ 0,12', preco('ZZ1CENTAVO1') === 0.12, String(preco('ZZ1CENTAVO1')));
  });

  for (const [codigo, esperaPreco] of [['ZZ0PRECO01', false], ['ZZNEGATIVO1', false], ['ZZ1CENTAVO1', true]]) {
    await step(`Busca de ${codigo}: ${esperaPreco ? 'mostra o preço de verdade' : 'não mostra preço'}`, async () => {
      await campo.fill(codigo); await campo.press('Enter');
      const linha = linhaDe(codigo);
      await linha.first().waitFor({ timeout: 20000 });
      const texto = (await linha.first().innerText()).replace(/\s+/g, ' ');
      if (esperaPreco) {
        check('a linha mostra R$ 0,12', /R\$\s?0,12/.test(texto), texto);
      } else {
        check('a linha NÃO mostra "R$ 0,00" nem valor negativo', !/R\$\s?0,00|-\s?R\$|R\$\s?-/.test(texto), texto);
        check('a linha oferece "Consultar no Parceiro"', texto.includes('Consultar no Parceiro'), texto);
        await shot(page, `${theme}-1366-preco-zero`);
      }
    });
  }

  await step('Peça sem preço entra no orçamento SEM valor (não de graça)', async () => {
    await campo.fill('ZZ0PRECO01'); await campo.press('Enter');
    const linha = linhaDe('ZZ0PRECO01');
    await linha.first().waitFor({ timeout: 20000 });
    await linha.first().locator('[data-row-add]').click();
    await page.waitForTimeout(600);
    await page.keyboard.press('Control+b');
    const card = page.getByRole('dialog');
    await card.waitFor({ timeout: 8000 });
    const textoCard = (await card.innerText()).replace(/\s+/g, ' ');
    check('o orçamento tem a peça', textoCard.includes('PLACA DE TESTE SEM PRECO'), textoCard.slice(0, 120));
    const precoDaLinha = await card.getByLabel(/^Preço unitário de PLACA DE TESTE SEM PRECO/).inputValue().catch(() => null);
    check('o campo de preço da linha está vazio (o atendente precisa digitar), não "0"', precoDaLinha === '' || precoDaLinha === null, String(precoDaLinha));
    await page.keyboard.press('Escape');
  });
} finally {
  apagar();
}
await finish(browser, errors);
