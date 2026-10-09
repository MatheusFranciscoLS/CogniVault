// IMPORTAR OS ORÇAMENTOS DE CONSERTO ANTIGOS (pasta "ORÇAMENTO DAVOS", 2019 em diante), pela tela do administrador, com os arquivos REAIS do dono.
// Os arquivos têm dado de cliente e NÃO ficam no repositório: informe a pasta já extraída em DAVOS_DIR (padrão C:\DadosLoja\davos-rar\extraido).
// Só roda na loja simulada. Apaga os orçamentos de conserto importados no fim (são os sem atendente), para os outros roteiros seguirem limpos.
// Uso (de dentro de frontend/): DAVOS_DIR="C:/DadosLoja/davos-rar/extraido" node ../docs/loja-simulada/conserto-importar.mjs [tema]
import fs from 'node:fs';
import path from 'node:path';
import { open, check, step, finish, shot, sqlSim } from './_t.mjs';

const DIR = process.env.DAVOS_DIR ?? 'C:/DadosLoja/davos-rar/extraido';
if (!fs.existsSync(DIR)) throw new Error(`Pasta dos orçamentos antigos não encontrada: ${DIR} (informe DAVOS_DIR)`);
const listar = (dir, acc = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) listar(p, acc); else acc.push(p); } return acc; };
const todos = listar(DIR);
const planilhasComOs = todos.filter(f => /\.(xlsx|xls)$/i.test(f) && /DAV[_ ]*\d{3,7}/i.test(path.basename(f)) && !path.basename(f).startsWith('~$'));
const osUnicas = new Set(planilhasComOs.map(f => String(Number(/DAV[_ ]*(\d{3,7})/i.exec(path.basename(f))[1]))));

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const api = p => page.evaluate(async url => (await fetch(url, { credentials: 'include' })).json(), p);
const limparImportados = () => sqlSim(`DELETE FROM "Quote" WHERE "kind" = 'REPAIR' AND "userId" IS NULL`);

try {
  limparImportados();
  await page.goto(new URL('/conserto', page.url()).href);
  await page.getByRole('heading', { name: 'Conserto', level: 1 }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);

  await step('Só o administrador vê "Importar antigos"', async () => {
    check('o botão aparece para o administrador', await page.getByRole('button', { name: 'Importar antigos' }).isVisible());
  });

  await step('Escolher a pasta: a tela conta o que vai e o que fica de fora, e junta as OS repetidas', async () => {
    await page.getByRole('button', { name: 'Importar antigos' }).click();
    const dialogo = page.getByRole('dialog', { name: /Importar orçamentos de conserto antigos/ });
    await dialogo.waitFor();
    await dialogo.getByLabel('Pasta com as planilhas ORÇAMENTO DAV').setInputFiles(DIR);
    await dialogo.getByText(/planilhas com número de OS/).waitFor({ timeout: 60000 });
    const texto = await dialogo.innerText();
    const enviar = Number(/([\d.]+)\s+planilhas? com número de OS/.exec(texto)?.[1].replace(/\./g, ''));
    check(`vão ${osUnicas.size.toLocaleString('pt-BR')} planilhas, uma por OS`, enviar === osUnicas.size, `${enviar} x ${osUnicas.size}`);
    check('diz quantas repetidas (vale a mais nova)', /repetidas? \(vale a mais nova\)/.test(texto));
    check('diz o que ficou de fora: temporários, sem número e não planilhas', /temporários? do Excel/.test(texto) && /sem número de OS no nome/.test(texto) && /que não são planilhas/.test(texto));
    await shot(page, `${theme}-1366-conserto-importar-escolha`);
  });

  let prontos = 0;
  await step('Ler as planilhas: o relatório vem do servidor e nada é gravado ainda', async () => {
    const dialogo = page.getByRole('dialog', { name: /Importar orçamentos de conserto antigos/ });
    await dialogo.getByRole('button', { name: 'Ler as planilhas' }).click();
    await dialogo.getByText(/prontos? para gravar/).waitFor({ timeout: 240000 });
    const texto = await dialogo.innerText();
    prontos = Number(/([\d.]+)\s+orçamentos? prontos? para gravar/.exec(texto)?.[1].replace(/\./g, ''));
    check('quase todas as planilhas são lidas (mais de 97%)', prontos / osUnicas.size > 0.97, `${prontos} de ${osUnicas.size}`);
    check('o relatório mostra o que já existe, o que tem problema e os avisos', /já (está|estão) na pasta/.test(texto) && /com problema/.test(texto) && /Entram, mas confira/.test(texto));
    check('nada foi gravado só de ler', (await api('/api/quotes?kind=REPAIR&take=1')).total === 0);
    await shot(page, `${theme}-1366-conserto-importar-relatorio`);
  });

  await step('Gravar: pede a confirmação com o número, grava em lotes e a pasta passa a ter todos', async () => {
    const dialogo = page.getByRole('dialog', { name: /Importar orçamentos de conserto antigos/ });
    await dialogo.getByRole('button', { name: /^Gravar [\d.]+$/ }).click();
    const confirmacao = page.getByRole('alertdialog');
    await confirmacao.waitFor();
    check('a confirmação diz quantos e que nada que já existe é trocado', new RegExp(`Gravar ${prontos.toLocaleString('pt-BR')}`).test(await confirmacao.innerText()) && /apagada ou trocada/.test(await confirmacao.innerText()));
    await confirmacao.getByRole('button', { name: 'Gravar' }).click();
    await dialogo.getByText(/gravados? na pasta/).waitFor({ timeout: 300000 });
    const total = (await api('/api/quotes?kind=REPAIR&take=1')).total;
    check(`a pasta passou a ter os ${prontos.toLocaleString('pt-BR')} orçamentos`, total === prontos, `${total}`);
    const sem = sqlSim(`SELECT count(*) FROM "Quote" WHERE "kind" = 'REPAIR' AND "userId" IS NULL AND "customerName" IS NOT NULL`);
    const comLocal = Number(sqlSim(`SELECT count(*) FROM "QuoteItem" WHERE "location" IS NOT NULL`));
    check('a prateleira (coluna LOC) entrou nas linhas que a têm', comLocal > 100, String(comLocal));
    check('entraram SEM cliente e SEM atendente', sem === '0' && Number(sqlSim(`SELECT count(*) FROM "Quote" WHERE "kind" = 'REPAIR' AND "userId" IS NULL`)) === prontos);
    const datas = sqlSim(`SELECT count(DISTINCT date_trunc('year', "savedAt")) FROM "Quote" WHERE "kind" = 'REPAIR'`);
    check('a data de cada um é a do arquivo (vários anos, não "hoje")', Number(datas) >= 5, datas);
    await dialogo.getByRole('button', { name: 'Fechar' }).click();
  });

  await step('A pasta acha pelo número da OS e abre o orçamento com as linhas e o prazo de cada uma', async () => {
    await page.waitForTimeout(1500);
    const pasta = page.getByRole('complementary', { name: 'Pasta de orçamentos de conserto' });
    const alvo = [...osUnicas].sort((a, b) => Number(b) - Number(a))[0];
    const alvoComLocal = sqlSim(`SELECT q."docNumber" FROM "Quote" q JOIN "QuoteItem" i ON i."quoteId" = q.id WHERE i."location" IS NOT NULL AND q."kind" = 'REPAIR' ORDER BY q."docNumber" LIMIT 1`);
    await pasta.getByLabel('Buscar na pasta de conserto').fill(alvo);
    await page.waitForTimeout(1200);
    check(`buscar a OS ${alvo} acha o orçamento`, await pasta.getByRole('button', { name: new RegExp(`OS ${alvo}`) }).isVisible());
    await pasta.getByRole('button', { name: new RegExp(`OS ${alvo}`) }).click();
    await page.waitForTimeout(1500);
    check('as linhas voltam na tela de conserto, com o Nº da OS', (await page.getByRole('button', { name: /^Remover / }).count()) >= 1 && (await page.getByLabel('Nº da OS', { exact: true }).inputValue()) === alvo);
    check('o cliente vem em branco (a planilha não tem)', (await page.locator('#repair-customer').inputValue()) === '');
    check('o prazo de cada linha veio da planilha', (await page.locator('select[aria-label^="Prazo de "]').count()) >= 1);
    await shot(page, `${theme}-1366-conserto-importado-aberto`);
    await page.getByRole('button', { name: 'Novo orçamento' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Começar novo' }).click();
    await page.waitForTimeout(600);
    await pasta.getByLabel('Buscar na pasta de conserto').fill(alvoComLocal);
    await page.waitForTimeout(1200);
    await pasta.getByRole('button', { name: new RegExp(`OS ${alvoComLocal}`) }).first().click();
    await page.waitForTimeout(1500);
    check(`a OS ${alvoComLocal} mostra a prateleira da peça ("Local ...") só na tela do balcão`, (await page.getByText(/Local [A-Z0-9-]+/).count()) >= 1);
    await shot(page, `${theme}-1366-conserto-importado-local`);
    await page.getByRole('button', { name: 'Novo orçamento' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Começar novo' }).click();
    await page.waitForTimeout(600);
  });

  await step('Importar de novo a mesma pasta não duplica nem troca nada', async () => {
    await page.getByRole('button', { name: 'Importar antigos' }).click();
    const dialogo = page.getByRole('dialog', { name: /Importar orçamentos de conserto antigos/ });
    await dialogo.getByLabel('Pasta com as planilhas ORÇAMENTO DAV').setInputFiles(DIR);
    await dialogo.getByRole('button', { name: 'Ler as planilhas' }).click();
    await dialogo.getByText(/já (está|estão) na pasta/).waitFor({ timeout: 240000 });
    const texto = await dialogo.innerText();
    check('0 prontos para gravar e o botão de gravar fica desabilitado', /0 orçamentos prontos para gravar/.test(texto) && (await dialogo.getByRole('button', { name: /^Gravar 0$/ }).isDisabled()));
    check('quase todos aparecem como "já estão na pasta"', Number(/([\d.]+)\s+já (está|estão) na pasta/.exec(texto)?.[1].replace(/\./g, '')) === prontos);
    await dialogo.getByRole('button', { name: 'Trocar a pasta' }).click();
    await page.keyboard.press('Escape');
    check('o total na pasta continua o mesmo', (await api('/api/quotes?kind=REPAIR&take=1')).total === prontos);
  });

  await step('O balcão (não administrador) enxerga a pasta importada e NÃO vê "Importar antigos"', async () => {
    const outro = await browser.newContext();
    const aba = await outro.newPage();
    const base = new URL(page.url()).origin;
    const entrada = await aba.request.post(base + '/api/login', { data: { email: 'mecanico.e2e@cognivault.local', password: 'CogniVault-E2E-2026!' }, headers: { Origin: base } });
    check('o balcão entra', entrada.ok(), String(entrada.status()));
    const lista = await (await aba.request.get(base + '/api/quotes?kind=REPAIR&take=1', { headers: { Origin: base } })).json();
    check('o balcão vê toda a pasta de conserto (é da loja)', lista.total === prontos, String(lista.total));
    const importar = await aba.request.post(base + '/api/admin/repair-import/preview', { data: { files: [] }, headers: { Origin: base } });
    check('e o servidor recusa a importação para quem não é administrador', importar.status() === 403, String(importar.status()));
    await outro.close();
  });
} finally {
  limparImportados();
}

await finish(browser, errors);
