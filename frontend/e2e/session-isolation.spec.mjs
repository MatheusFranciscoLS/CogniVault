import { test, expect } from '@playwright/test';

const PASSWORD = 'CogniVault-E2E-2026!';
const ADMIN_EMAIL = 'admin.e2e@cognivault.local';
const COUNTER_EMAIL = 'mecanico.e2e@cognivault.local';

async function login(page, email) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByPlaceholder(/Código, peça, modelo|Peça, código ou pergunta/)).toBeVisible();
}

async function logout(page) {
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login/);
}

test('React Query não reaproveita dados da conta anterior na mesma aba', async ({ page }) => {
  let catalogRequests = 0;
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname.endsWith('/api/documents')) catalogRequests += 1;
  });

  await login(page, ADMIN_EMAIL);
  await page.getByRole('button', { name: 'Catálogos', exact: true }).click();
  await expect.poll(() => catalogRequests).toBeGreaterThan(0);
  const requestsAfterAdmin = catalogRequests;

  await logout(page);
  await login(page, COUNTER_EMAIL);
  await page.getByRole('button', { name: 'Catálogos', exact: true }).click();

  // A query usa a mesma chave lógica nas duas contas. Se o QueryClient fosse
  // global, os dados ainda estariam fresh por 5 minutos e esta segunda conta
  // renderizaria o cache anterior sem consultar o backend novamente.
  await expect.poll(() => catalogRequests).toBeGreaterThan(requestsAfterAdmin);
});

test('dados privados do rascunho não atravessam logout quando a API fica offline', async ({ page }) => {
  await login(page, ADMIN_EMAIL);

  const previousCustomer = 'Cliente exclusivo da conta A';
  await page.evaluate(value => {
    localStorage.setItem('cognivault_quote_draft_options', JSON.stringify({
      customerName: value,
      customerPhone: '00000000000',
      paymentMethod: 'PIX',
      machineModel: 'TEST-A',
      discountPercentage: 7,
    }));
  }, previousCustomer);

  await logout(page);

  // A segunda conta precisa cair no cache local para o teste medir exatamente
  // o isolamento offline. Se o GET passasse, o servidor vazio poderia mascarar
  // o vazamento sobrescrevendo o cache antigo.
  await page.route('**/api/quotes/draft', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'offline de teste' }),
      });
      return;
    }
    await route.continue();
  });

  await login(page, COUNTER_EMAIL);

  const options = await page.evaluate(() => {
    const raw = localStorage.getItem('cognivault_quote_draft_options');
    return raw ? JSON.parse(raw) : null;
  });

  expect(options?.customerName ?? null).not.toBe(previousCustomer);
  expect(options?.customerPhone ?? null).not.toBe('00000000000');
  expect(options?.machineModel ?? null).not.toBe('TEST-A');
});
