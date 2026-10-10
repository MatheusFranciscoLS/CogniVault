// API FORA DO AR ao abrir o sistema (2026-10-10): servidor acordando/reiniciando NÃO é "sessão inválida". Antes, qualquer falha em /api/me (5xx, HTML de erro do rewrite, rede)
// apagava a sessão local, trocava o orçamento para o escopo anônimo e jogava o atendente na tela de login. Agora: só 401/403 vai ao login; o resto mostra "Não foi possível abrir
// o CogniVault", tenta de novo sozinho (2 s, 4 s, 8 s…) e entra quando o servidor responde, com a sessão e o orçamento intactos.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/api-fora-do-ar.mjs [tema]
import { open, check, step, finish, shot, BASE, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light', width: 1366, height: 768 });
const caminho = () => new URL(page.url()).pathname;
const corpo = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

// um orçamento em andamento: precisa sobreviver à queda do servidor
await page.goto(BASE + '/atendimento');
const campo = page.getByPlaceholder(SEARCH);
await campo.waitFor({ timeout: 30000 });
await campo.fill('carburador 143RII'); await campo.press('Enter');
await page.locator('[data-row-add]').first().waitFor({ timeout: 30000 });
await page.locator('[data-row-add]').first().click();
await page.waitForTimeout(1500);
const itensAntes = await page.evaluate(() => Object.keys(localStorage).filter(k => /quote/i.test(k)).length);

/** Falha as N primeiras chamadas de /api/me do jeito pedido e deixa as seguintes passarem. */
async function falharMe(vezes, jeito) {
  let chamadas = 0;
  await page.route('**/api/me', async route => {
    chamadas += 1;
    if (chamadas > vezes) return route.continue();
    if (jeito === 'rede') return route.abort('failed');
    if (jeito === 'html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Service Unavailable</body></html>' });
    return route.fulfill({ status: Number(jeito), contentType: 'application/json', body: JSON.stringify({ error: 'indisponível agora' }) });
  });
  return () => chamadas;
}

for (const [jeito, rotulo] of [['500', 'erro 500'], ['503', 'erro 503'], ['html', 'HTML de erro com status 200 (servidor acordando atrás do rewrite)'], ['rede', 'rede caída']]) {
  await step(`Servidor fora do ar ao abrir: ${rotulo}`, async () => {
    await page.unroute('**/api/me').catch(() => {});
    const chamadas = await falharMe(2, jeito);
    await page.goto(BASE + '/orcamentos');
    await page.waitForTimeout(1200);
    check('NÃO vai para o login', caminho() === '/orcamentos', caminho());
    check('mostra "Não foi possível abrir o CogniVault" com as duas saídas', (await corpo()).includes('Não foi possível abrir o CogniVault') && await page.getByRole('button', { name: 'Tentar de novo' }).isVisible() && await page.getByRole('button', { name: 'Entrar novamente' }).isVisible());
    check('avisa que tenta de novo sozinho', (await corpo()).includes('tenta de novo sozinho'));
    check('a sessão local continua (o e-mail do atendente não foi apagado)', await page.evaluate(() => !!localStorage.getItem('cognivault_email')));
    if (jeito === '500') await shot(page, `${theme}-1366-api-fora-do-ar`);
    // 1ª tentativa sozinha em 2 s e 2ª em 4 s: a 3ª chamada passa
    await page.getByRole('heading', { level: 1, name: 'Orçamentos' }).waitFor({ timeout: 15000 });
    check('quando o servidor volta, entra sozinho na tela em que estava', caminho() === '/orcamentos' && chamadas() >= 3, `${caminho()} chamadas=${chamadas()}`);
    check('o orçamento em andamento continua (escopo do atendente intacto)', await page.evaluate(() => Object.keys(localStorage).filter(k => /quote/i.test(k)).length) >= itensAntes);
  });
}

await step('Sem sessão de verdade (401) vai ao login, como sempre', async () => {
  await page.unroute('**/api/me').catch(() => {});
  await page.route('**/api/me', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Sessão inválida"}' }));
  await page.goto(BASE + '/orcamentos');
  await page.waitForURL('**/login', { timeout: 10000 });
  check('401 em /api/me leva ao login', caminho() === '/login');
  await page.unroute('**/api/me');
});

await step('"Tentar de novo" e "Entrar novamente" fazem o que dizem', async () => {
  await page.unroute('**/api/me').catch(() => {});
  await page.route('**/api/me', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fora"}' }));
  await page.goto(BASE + '/catalogos');
  await page.getByRole('button', { name: 'Entrar novamente' }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Entrar novamente' }).click();
  await page.waitForURL('**/login', { timeout: 10000 });
  check('"Entrar novamente" leva ao login', caminho() === '/login');
  await page.unroute('**/api/me');
});

await finish(browser, errors.filter(e => !/status of (40[13]|50[0-9])|ERR_FAILED|Failed to load resource/.test(e)));
