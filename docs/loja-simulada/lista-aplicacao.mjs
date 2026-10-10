// "SERVE EM" dos acessórios (2026-10-09, dono: "aplicação seria bom"): o relatório conta quantos acessórios da loja serão preenchidos, gravar preenche, e a busca
// mostra onde o acessório serve. Arquivo INVENTADO e loja SIMULADA; restaura tudo no fim.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/lista-aplicacao.mjs [tema]
import fs from 'node:fs';
import path from 'node:path';
import { open, check, step, finish, shot, sqlSim, confirmar, OUT, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const pasta = path.join(OUT, 'lista-aplicacao');
fs.mkdirSync(pasta, { recursive: true });
const tenant = sqlSim(`SELECT "tenantId" FROM "User" WHERE email = 'admin.e2e@cognivault.local'`);

const acessorios = [
  { codigo: 'ZZACES001', descricao: 'CABECOTE TESTE UM', preco: 'R$ 92,00', aplicacao: 'PA1100 - 129LK / 525LK / 327LDX \n536LiP4 / 530iPT5' },
  { codigo: 'ZZACES002', descricao: 'LAMINA TESTE DOIS', preco: 'R$ 92,00', aplicacao: '120i / 536LiPX' },
  { codigo: 'ZZACES003', descricao: 'CORRENTE TESTE TRES', preco: 'R$ 92,00', aplicacao: '-' },
  { codigo: 'ZZACES004', descricao: 'FIO TESTE QUATRO', preco: 'R$ 92,00' },
  { codigo: 'ZZACES005', descricao: 'ACESSORIO JA PREENCHIDO', preco: 'R$ 92,00', aplicacao: 'NAO DEVE TROCAR' },
];
// Um código NOVO (a loja não tem) para provar que ele já entra com a aplicação.
const novo = { codigo: 'ZZACES006', descricao: 'ACESSORIO NOVO SEIS', preco: 'R$ 46,00', aplicacao: 'TF230 / TF338' };
const arquivo = path.join(pasta, 'lista-aplicacao.html');
fs.writeFileSync(arquivo, `<!DOCTYPE html><html><body><script id="catalogData" type="application/json">${JSON.stringify({ produtos: [], pecas: [{ codigo: 'ZZPECA001', descricao: 'PECA', preco: 'R$ 92,00', modelo: 'MODELO TESTE' }], acessorios: [...acessorios, novo], lubrificantes: [], ferramentas: [] })}</script></body></html>`);

const restaurar = () => {
  sqlSim(`DELETE FROM "MasterPartSection" WHERE "normalizedNumber" LIKE 'ZZACES%' OR "normalizedNumber" = 'ZZPECA001'`);
  sqlSim(`DELETE FROM "MasterPart" WHERE "normalizedNumber" LIKE 'ZZACES%' OR "normalizedNumber" = 'ZZPECA001'`);
  sqlSim(`DELETE FROM "CommercialImportRun" WHERE "sourceFilename" = 'lista-aplicacao.html'`);
};
/** A loja já tem 5 acessórios (preço certo: 92 / 0,92 = 100), todos SEM aplicação, menos o ZZACES005 que já tem uma. */
const semear = () => {
  restaurar();
  for (const [codigo, aplicacao] of [['ZZACES001', null], ['ZZACES002', null], ['ZZACES003', null], ['ZZACES004', null], ['ZZACES005', 'APLICACAO ANTIGA']]) {
    sqlSim(`INSERT INTO "MasterPart" (id, "tenantId", "partNumber", "normalizedNumber", name, description, price, brand, category, "updatedAt") VALUES (gen_random_uuid()::text, '${tenant}', '${codigo}', '${codigo}', 'ACESSORIO ${codigo}', 'ACESSORIO ${codigo}', 100, 'HUSQVARNA', 'ACESSÓRIOS', now())`.replace('ACESSÓRIOS', 'ACESS'));
    sqlSim(`INSERT INTO "MasterPartSection" (id, "tenantId", "normalizedNumber", section, application, "applicationKey", reference, "sourceSheet", "updatedAt") VALUES (gen_random_uuid()::text, '${tenant}', '${codigo}', 'ACESS', ${aplicacao ? `'${aplicacao}'` : 'NULL'}, ${aplicacao ? `'${aplicacao.replace(/[^A-Z0-9]/g, '')}'` : "''"}, 'HUSQVARNA', 'LISTA_HTML:acessorios', now())`);
  }
  sqlSim(`INSERT INTO "MasterPart" (id, "tenantId", "partNumber", "normalizedNumber", name, price, brand, "updatedAt") VALUES (gen_random_uuid()::text, '${tenant}', 'ZZPECA001', 'ZZPECA001', 'PECA', 100, 'HUSQVARNA', now())`);
};
const aplicacaoNoBanco = codigo => sqlSim(`SELECT coalesce(string_agg(coalesce(application, '(vazio)'), ' | '), '(sem secao)') FROM "MasterPartSection" WHERE "tenantId" = '${tenant}' AND "normalizedNumber" = '${codigo}'`);

try {
  semear();
  await page.goto('http://127.0.0.1:5173/administracao/negocio?aba=lista');
  const cartao = page.getByRole('region', { name: 'Atualizar a lista de preços' });
  await cartao.waitFor({ timeout: 30000 });
  await cartao.scrollIntoViewIfNeeded();

  await step('O relatório conta os acessórios que serão preenchidos e NÃO grava nada', async () => {
    await cartao.locator('#price-list-file').setInputFiles(arquivo);
    await cartao.getByRole('button', { name: 'Gravar na loja' }).waitFor({ timeout: 60000 });
    const texto = (await cartao.innerText()).replace(/\s+/g, ' ');
    check('mostra "Serve em dos acessórios: 2 acessórios serão preenchidos" (só ZZACES001 e 002)', /Serve em dos acessórios:\s*2 acessórios serão preenchidos/.test(texto), texto.slice(0, 300));
    check('um código novo (ZZACES006) aparece como código novo', /1\s*Código novo/.test(texto));
    check('o botão de gravar está habilitado', await cartao.getByRole('button', { name: 'Gravar na loja' }).isEnabled());
    check('nada foi gravado', aplicacaoNoBanco('ZZACES001') === '(vazio)');
    await shot(page, `${theme}-1366-lista-aplicacao-relatorio`);
  });

  await step('Gravar preenche só o que está vazio e o código novo já entra com o "serve em"', async () => {
    await cartao.getByRole('button', { name: 'Gravar na loja' }).click();
    const dialogo = page.getByRole('alertdialog');
    await dialogo.waitFor();
    check('a confirmação fala do "serve em"', /o "serve em" de 2 acessórios será preenchido/.test(await dialogo.innerText()), (await dialogo.innerText()).slice(0, 220));
    await dialogo.getByRole('button', { name: 'Gravar' }).click();
    await cartao.getByText(/Pronto:/).waitFor({ timeout: 60000 });
    check('a mensagem de sucesso conta o "serve em"', /"serve em" preenchido em 2 acessórios/.test(await cartao.innerText()), (await cartao.innerText()).replace(/\s+/g, ' ').slice(0, 200));
    check('ZZACES001 recebeu as máquinas, com as linhas unidas por " · "', aplicacaoNoBanco('ZZACES001') === 'PA1100 - 129LK / 525LK / 327LDX · 536LiP4 / 530iPT5', aplicacaoNoBanco('ZZACES001'));
    check('ZZACES002 também', aplicacaoNoBanco('ZZACES002') === '120i / 536LiPX');
    check('"-" não vira aplicação (ZZACES003 continua vazio)', aplicacaoNoBanco('ZZACES003') === '(vazio)');
    check('sem o campo (ZZACES004) continua vazio', aplicacaoNoBanco('ZZACES004') === '(vazio)');
    check('o que já tinha aplicação NÃO foi trocado (ZZACES005)', aplicacaoNoBanco('ZZACES005') === 'APLICACAO ANTIGA', aplicacaoNoBanco('ZZACES005'));
    check('o código novo entrou com o "serve em"', aplicacaoNoBanco('ZZACES006') === 'TF230 / TF338', aplicacaoNoBanco('ZZACES006'));
    check('preço dos acessórios intacto (R$ 100)', sqlSim(`SELECT price FROM "MasterPart" WHERE "normalizedNumber" = 'ZZACES001'`) === '100');
  });

  await step('A busca mostra onde o acessório serve', async () => {
    await page.goto('http://127.0.0.1:5173/atendimento');
    const campo = page.getByPlaceholder(SEARCH);
    await campo.waitFor({ timeout: 30000 });
    await campo.fill('ZZACES001');
    await campo.press('Enter');
    await page.getByText('ACESSORIO ZZACES001').first().waitFor({ timeout: 20000 });
    const linha = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    check('a linha traz "PA1100 - 129LK / 525LK / 327LDX · 536LiP4 / 530iPT5"', linha.includes('PA1100 - 129LK / 525LK / 327LDX · 536LiP4 / 530iPT5'), linha.slice(0, 260));
    check('e não diz mais "Aplicação não informada"', !linha.includes('Aplicação não informada'));
    await shot(page, `${theme}-1366-lista-aplicacao-busca`);
    await campo.fill('ZZACES004');
    await campo.press('Enter');
    await page.getByText('ACESSORIO ZZACES004').first().waitFor({ timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    const vazio = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    check('sem "serve em" na lista, a linha continua como era (sem inventar nada)', !vazio.includes('PA1100') && !vazio.includes('120i / 536LiPX'), vazio.slice(0, 200));
  });

  await step('Escolher o mesmo arquivo de novo: a loja já está igual', async () => {
    await page.goto('http://127.0.0.1:5173/administracao/negocio?aba=lista');
    await cartao.waitFor({ timeout: 30000 });
    await cartao.locator('#price-list-file').setInputFiles(arquivo);
    await cartao.getByText(/A loja já está igual a esta lista/).waitFor({ timeout: 60000 });
    check('o botão de gravar fica desabilitado e não há mais "serve em" a preencher', await cartao.getByRole('button', { name: 'Gravar na loja' }).isDisabled() && !/Serve em dos acessórios/.test(await cartao.innerText()));
  });
} finally {
  restaurar();
}

await finish(browser, errors);
