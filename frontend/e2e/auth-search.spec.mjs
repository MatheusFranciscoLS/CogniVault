import { test, expect } from '@playwright/test';

const PASSWORD = 'CogniVault-E2E-2026!';
const ADMIN_EMAIL = 'admin.e2e@cognivault.local';
const MECHANIC_EMAIL = 'mecanico.e2e@cognivault.local';

async function login(page, email) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar no CogniVault' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Encontre a peça certa. Entenda por quê.' })).toBeVisible();
}

async function searchCarburettor(page) {
  const search = page.getByPlaceholder(/Código, peça, modelo|Peça, código ou pergunta/);
  await search.fill('carburador 143RII 967332904');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('587106701', { exact: true })).toBeVisible();
}

test('rota protegida rejeita navegador sem sessão', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
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
