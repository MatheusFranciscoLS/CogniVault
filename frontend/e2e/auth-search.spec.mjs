import { test, expect } from '@playwright/test';

const PASSWORD = 'CogniVault-E2E-2026!';
const ADMIN_EMAIL = 'admin.e2e@cognivault.local';
const MECHANIC_EMAIL = 'mecanico.e2e@cognivault.local';

async function login(page, email) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  // Âncora pós-login: o campo de busca, que é o elemento funcional da tela.
  // O título decorativo que servia de âncora saiu — três cabeçalhos empilhados
  // diziam a mesma coisa antes da busca.
  await expect(page.getByPlaceholder(/Código, peça, modelo|Peça, código ou pergunta/)).toBeVisible();
}

async function searchCarburettor(page) {
  const search = page.getByPlaceholder(/Código, peça, modelo|Peça, código ou pergunta/);
  await search.fill('carburador 143RII 967332904');
  await page.getByRole('button', { name: 'Buscar' }).click();
  const technicalResult = page.getByRole('button', { name: 'Abrir detalhes de CARBURADOR' });
  await expect(technicalResult).toBeVisible();
  await expect(technicalResult.getByText('587106701', { exact: true })).toBeVisible();
}

test('rota protegida rejeita navegador sem sessão', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});

test('login cabe inteiro em viewport desktop sem scroll vertical', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Entrar no CogniVault' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();

  // O logo da Vardão existe duas vezes no DOM (painel da marca em desktop e
  // cabeçalho compacto em telas menores), e só um renderiza por vez. A asserção
  // é escopada ao painel para não cair no modo estrito do Playwright.
  const brandPanel = page.locator('main > aside');
  await expect(brandPanel.getByAltText('Vardão Máquinas')).toBeVisible();
  // Selo de revenda autorizada: foi pedido explicitamente pelo proprietário.
  await expect(brandPanel.getByAltText('Husqvarna')).toBeVisible();
  await expect(brandPanel.getByText('Revenda Autorizada Ouro')).toBeVisible();

  const viewport = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));

  expect(viewport.scrollHeight).toBeLessThanOrEqual(viewport.clientHeight + 1);
});

test('sessão usa cookie HttpOnly, sobrevive a reload e isola orçamento por usuário', async ({ page, context }) => {
  await login(page, ADMIN_EMAIL);

  const tokenInStorage = await page.evaluate(() => localStorage.getItem('cognivault_token'));
  expect(tokenInStorage).toBeNull();

  const sessionCookie = (await context.cookies()).find(cookie => cookie.name === 'cognivault_session');
  expect(sessionCookie).toBeTruthy();
  expect(sessionCookie.httpOnly).toBe(true);

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/);
  // Âncora pós-login: o campo de busca, que é o elemento funcional da tela.
  // O título decorativo que servia de âncora saiu — três cabeçalhos empilhados
  // diziam a mesma coisa antes da busca.
  await expect(page.getByPlaceholder(/Código, peça, modelo|Peça, código ou pergunta/)).toBeVisible();

  await searchCarburettor(page);
  await page.getByRole('button', { name: '+ Orçamento' }).first().click();
  await expect(page.getByRole('button', { name: /No orçamento/ }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login/);
  const clearedCookie = (await context.cookies()).find(cookie => cookie.name === 'cognivault_session');
  expect(clearedCookie).toBeFalsy();

  await login(page, MECHANIC_EMAIL);
  await searchCarburettor(page);
  await expect(page.getByRole('button', { name: '+ Orçamento' }).first()).toBeVisible();
});

test('visão geral mantém telemetria compacta da rota do Portal BR', async ({ page }) => {
  await login(page, ADMIN_EMAIL);
  await page.goto('/dashboard?tab=overview');

  await expect(page.getByRole('heading', { name: 'Uso, cache e cobertura técnica' })).toBeVisible();
  await expect(page.getByText('Portal BR · rota', { exact: true })).toBeVisible();
});

test('qualidade compartilha uma única fonte de dados sob StrictMode', async ({ page }) => {
  await login(page, ADMIN_EMAIL);

  let qualityRequests = 0;
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname.endsWith('/api/admin/quality')) {
      qualityRequests += 1;
    }
  });

  const qualityResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && url.pathname.endsWith('/api/admin/quality');
  });

  await page.goto('/dashboard?tab=quality');
  expect((await qualityResponse).ok()).toBe(true);

  await expect(page.getByRole('heading', { name: 'Cobertura do portfólio BR' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Confiabilidade' })).toBeVisible();

  // O E2E usa Vite dev + React StrictMode. Em desenvolvimento, o React remonta
  // efeitos uma vez para detectar efeitos colaterais, então uma única fonte lógica
  // de fetch produz exatamente 2 requests. Duas fontes independentes voltariam a 4.
  await page.waitForTimeout(500);
  expect(qualityRequests).toBe(2);
});

/**
 * A cesta se reconcilia sozinha depois de uma falha de gravação.
 *
 * **Regressão medida em produção**, log do Render em 18/09/2026 21:16 UTC: o
 * `PUT /api/quotes/draft` voltou 500 porque a transação interativa do Prisma
 * estourou a janela padrão de 5 s (6725 ms de latência no plano free). O teto
 * explícito no backend cobre a causa; este teste cobre a consequência que
 * sobrava do lado da tela.
 *
 * O que estava errado: depois da falha, a cesta só era reenviada na PRÓXIMA
 * edição. Quando a falha cai no último item adicionado — que é o caso comum,
 * põe a peça e vai gerar o PDF — ela ficava fora do servidor indefinidamente,
 * e trocar de aparelho perdia o atendimento.
 *
 * Aqui ninguém toca na tela entre o erro e a recuperação: é o reenvio
 * automático que tem que fechar a conta.
 */
test('cesta volta para o servidor sozinha depois de uma falha de gravação', async ({ page }) => {
  await login(page, ADMIN_EMAIL);

  // Só o PUT falha. A hidratação (GET) tem que continuar passando, senão o
  // teste mediria "não carregou" em vez de "não gravou".
  let derrubarGravacao = true;
  await page.route('**/api/quotes/draft', async route => {
    if (derrubarGravacao && route.request().method() === 'PUT') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Não foi possível salvar a cesta de orçamento.' }),
      });
      return;
    }
    await route.continue();
  });

  await searchCarburettor(page);
  await page.getByRole('button', { name: '+ Orçamento' }).first().click();
  await page.getByRole('button', { name: 'Revisar orçamento' }).click();

  // `exact` porque o texto do selo também aparece dentro do aviso em texto
  // corrido da gaveta ('Esta cesta está só neste aparelho — ...'), e o match
  // por substring do Playwright casaria com os dois.
  await expect(page.getByText('Só neste aparelho', { exact: true })).toBeVisible();

  // A conexão volta — e mais nada acontece na tela. Sem o reenvio automático,
  // o selo fica em "Só neste aparelho" para sempre.
  derrubarGravacao = false;
  await expect(page.getByText('No servidor', { exact: true })).toBeVisible({ timeout: 30_000 });
});
