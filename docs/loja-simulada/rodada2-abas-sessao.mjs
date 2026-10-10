// RODADA 2 de auditoria (lógica): duas abas do mesmo navegador, sessão que cai no meio do atendimento, rede que cai e volta, e outro atendente no mesmo PC.
// Todos esses casos perdiam ou vazavam o que o balcão digitou antes de 2026-10-09. Loja SIMULADA.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/rodada2-abas-sessao.mjs [tema]
import { open, check, step, finish, sqlSim, BASE } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const SENHA = 'CogniVault-E2E-2026!';
const limpar = () => sqlSim(`DELETE FROM "Quote" WHERE "status" = 'DRAFT'`);
const rascunhoDoServidor = () => sqlSim(`SELECT coalesce(string_agg(i.name, ' | ' ORDER BY i."sortOrder"), '') FROM "QuoteItem" i JOIN "Quote" q ON q.id = i."quoteId" WHERE q.status = 'DRAFT' AND q.kind = 'REPAIR'`);
const ed = p => p.getByRole('region', { name: 'Orçamento de conserto' });
const linhas = p => ed(p).locator('ul > li').evaluateAll(lis => lis.filter(li => !li.getAttribute('aria-hidden')).map(li => li.innerText.split('\n')[0].trim()));
const lancar = async (p, nome, valor) => {
  await ed(p).getByLabel('Descrição do serviço ou item').fill(nome);
  await ed(p).getByLabel('Valor unitário (R$)').fill(valor);
  await ed(p).getByLabel('Valor unitário (R$)').press('Enter');
  await p.waitForTimeout(2200);
};
async function zerar() {
  limpar();
  await page.evaluate(() => ['cognivault_repair_cart', 'cognivault_repair_draft_options', 'cognivault_repair_unsynced'].forEach(k => localStorage.removeItem(k)));
  await page.goto(new URL('/conserto', page.url()).href);
  await ed(page).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
}
async function entrarPelaTela(email) {
  await page.getByRole('textbox').first().fill(email);
  await page.locator('input[type=password]').fill(SENHA);
  await page.keyboard.press('Enter');
  await page.waitForURL(/atendimento|dashboard/, { timeout: 15000 });
  await page.waitForTimeout(800);
}

try {
  await step('Duas abas do mesmo navegador são UMA cesta (nada se perde, nada se duplica)', async () => {
    await zerar();
    const b = await page.context().newPage();
    await b.goto(new URL('/conserto', page.url()).href);
    await ed(b).waitFor({ timeout: 20000 });
    await page.waitForTimeout(1000);
    await lancar(page, 'AAA da aba um', '10');
    await lancar(b, 'BBB da aba dois', '20');
    check('a aba 1 mostra as duas linhas', JSON.stringify(await linhas(page)) === JSON.stringify(['AAA da aba um', 'BBB da aba dois']), JSON.stringify(await linhas(page)));
    check('a aba 2 mostra as duas linhas', JSON.stringify(await linhas(b)) === JSON.stringify(['AAA da aba um', 'BBB da aba dois']), JSON.stringify(await linhas(b)));
    check('o servidor tem as duas (antes uma apagava a outra)', rascunhoDoServidor() === 'AAA da aba um | BBB da aba dois', rascunhoDoServidor());
    await page.getByLabel('Cliente', { exact: true }).fill('Fazenda Duas Abas');
    await page.getByLabel('Nº da OS', { exact: true }).fill('4242');
    await page.waitForTimeout(1500);
    check('cliente e OS digitados numa aba aparecem na outra', await b.getByLabel('Cliente', { exact: true }).inputValue() === 'Fazenda Duas Abas' && await b.getByLabel('Nº da OS', { exact: true }).inputValue() === '4242');
    await ed(page).getByRole('button', { name: /Tirar|Remover|Excluir/ }).first().click().catch(() => undefined);
    await page.waitForTimeout(1500);
    const depois = await linhas(b);
    check('tirar uma linha numa aba tira na outra', depois.length === 1, JSON.stringify(depois));
    await b.close();
    await page.reload();
    await ed(page).waitFor({ timeout: 20000 });
    await page.waitForTimeout(1800);
    check('recarregar traz o mesmo que o servidor tem', JSON.stringify(await linhas(page)) === JSON.stringify(depois), JSON.stringify(await linhas(page)));
  });

  await step('A sessão cai no meio: volta para o login e, entrando de novo, NADA do que foi digitado some', async () => {
    await zerar();
    await page.getByLabel('Cliente', { exact: true }).fill('Cliente da sessao');
    await page.getByLabel('Nº da OS', { exact: true }).fill('7777');
    await lancar(page, 'ANTES da sessao cair', '10');
    await page.context().clearCookies();
    await lancar(page, 'DEPOIS da sessao cair', '20');
    await page.waitForURL(/login/, { timeout: 15000 });
    check('foi para o login', /login/.test(page.url()));
    await entrarPelaTela('admin.e2e@cognivault.local');
    await page.goto(new URL('/conserto', page.url()).href);
    await ed(page).waitFor({ timeout: 20000 });
    await page.waitForTimeout(2500);
    const l = await linhas(page);
    check('as duas linhas voltam (a que foi digitada depois da queda também)', l.includes('ANTES da sessao cair') && l.includes('DEPOIS da sessao cair'), JSON.stringify(l));
    check('cliente e OS continuam', await page.getByLabel('Cliente', { exact: true }).inputValue() === 'Cliente da sessao' && await page.getByLabel('Nº da OS', { exact: true }).inputValue() === '7777');
    check('e o servidor também passou a ter as duas', rascunhoDoServidor().includes('DEPOIS da sessao cair'), rascunhoDoServidor());
  });

  await step('A rede cai, o balcão continua digitando e recarrega quando ela volta: nada se perde', async () => {
    await zerar();
    await lancar(page, 'COM rede', '10');
    await page.context().setOffline(true);
    await lancar(page, 'SEM rede um', '20');
    await lancar(page, 'SEM rede dois', '30');
    check('avisa que está só neste aparelho', (await ed(page).innerText()).includes('Só neste aparelho'));
    await page.context().setOffline(false);
    // recarrega ANTES de a escada de reenvio tentar de novo: era aqui que a versão velha do servidor vencia
    await page.reload();
    await ed(page).waitFor({ timeout: 20000 });
    await page.waitForTimeout(3000);
    const l = await linhas(page);
    check('as três linhas estão na tela', l.length === 3 && l.includes('SEM rede dois'), JSON.stringify(l));
    check('e no servidor', rascunhoDoServidor() === 'COM rede | SEM rede um | SEM rede dois', rascunhoDoServidor());
    check('e o aviso volta a "No servidor"', (await ed(page).innerText()).includes('No servidor'));
  });

  await step('Outro atendente no mesmo PC não vê (nem sobe para a conta dele) o conserto do anterior', async () => {
    await zerar();
    await page.getByLabel('Cliente', { exact: true }).fill('Cliente PRIVADO da Ana');
    await page.getByLabel('Nº da OS', { exact: true }).fill('9191');
    await lancar(page, 'LINHA PRIVADA', '99');
    // sair e entrar com outra conta, pela tela
    await page.getByRole('banner').getByRole('button').filter({ hasText: /^AD$/ }).click();
    await page.getByRole('menuitem', { name: /sair/i }).click();
    await page.waitForURL(/login/, { timeout: 15000 });
    await entrarPelaTela('mecanico.e2e@cognivault.local');
    // Pelo menu, SEM recarregar: o roteiro grava o e-mail do administrador a cada carga de página (initScript), o que mudaria de volta a conta no navegador.
    await page.getByRole('button', { name: 'Conserto', exact: true }).click();
    await ed(page).waitFor({ timeout: 20000 });
    await page.waitForTimeout(2500);
    check('o outro atendente vê a cesta de conserto VAZIA', (await linhas(page)).length === 0, JSON.stringify(await linhas(page)));
    check('sem o cliente e a OS do anterior', await page.getByLabel('Cliente', { exact: true }).inputValue() === '' && await page.getByLabel('Nº da OS', { exact: true }).inputValue() === '');
    check('e nada foi gravado no rascunho dele', rascunhoDoServidor() === '' || !rascunhoDoServidor().includes('LINHA PRIVADA') || sqlSim(`SELECT count(*) FROM "Quote" q JOIN "User" u ON u.id = q."userId" WHERE q.status='DRAFT' AND q.kind='REPAIR' AND u.email='mecanico.e2e@cognivault.local' AND q."totalItems" > 0`) === '0');
  });
} finally {
  limpar();
  await page.context().setOffline(false).catch(() => undefined);
}

// 401 (cookie apagado) e conexão derrubada são as falhas que EU injetei nos cenários 2 e 3: esperadas, não contam como erro do roteiro.
for (let i = errors.length - 1; i >= 0; i--) if (/status of 401|ERR_INTERNET_DISCONNECTED|ERR_NETWORK|ERR_FAILED/.test(String(errors[i]))) errors.splice(i, 1);
await finish(browser, errors);
