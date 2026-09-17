import { test, expect } from '@playwright/test';

const PASSWORD = 'CogniVault-E2E-2026!';
const ADMIN_EMAIL = 'admin.e2e@cognivault.local';
const MECHANIC_EMAIL = 'mecanico.e2e@cognivault.local';

async function login(page, email) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar no CogniVault' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Encontre a peça certa. Entenda por quê.' })).toBeVisible();
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

  await expect(page.getByRole('heading', { name: 'Bem-vindo ao CogniVault' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar no CogniVault' })).toBeVisible();
  await expect(page.getByAltText('Vardão Máquinas')).toBeVisible();

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
  await expect(page.getByRole('heading', { name: 'Encontre a peça certa. Entenda por quê.' })).toBeVisible();

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
