import { test, expect } from '@playwright/test';

const PASSWORD = 'CogniVault-E2E-2026!';
const MECHANIC_EMAIL = 'mecanico.e2e@cognivault.local';
const CODE = '15004-0937';
const PART_ID = 'part-kawasaki-e2e';

async function login(page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(MECHANIC_EMAIL);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByPlaceholder(/Código, peça, modelo|Peça, código ou pergunta/)).toBeVisible();
}

async function mockPartManufacturer(page) {
  await page.route(
    url => url.pathname.endsWith(`/api/parts/${PART_ID}`),
    route => route.fulfill({
      json: {
        part: {
          manufacturer: 'Kawasaki',
          document: { manufacturer: 'Kawasaki' },
        },
      },
    }),
  );
}

async function expectKawasakiInDraft(page, click) {
  const draftRequest = page.waitForRequest(request => {
    if (request.method() !== 'PUT') return false;
    const url = new URL(request.url());
    if (!url.pathname.endsWith('/api/quotes/draft')) return false;
    try {
      return request.postDataJSON()?.items?.some(item => item.partNumber === CODE);
    } catch {
      return false;
    }
  });

  await click();
  const request = await draftRequest;
  const item = request.postDataJSON().items.find(entry => entry.partNumber === CODE);
  expect(item?.manufacturer).toBe('Kawasaki');
}

test.beforeEach(async ({ page }) => {
  await mockPartManufacturer(page);
});

test('favorito preserva fabricante real no orçamento sem formatar o código como Husqvarna', async ({ page }) => {
  await page.route(
    url => url.pathname.endsWith('/api/favorites'),
    route => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({
        json: {
          favorites: [{
            id: 'favorite-kawasaki-e2e',
            kind: 'PART',
            label: 'GASKET',
            reference: CODE,
            model: 'FX921V-ES06',
            pnc: null,
            partId: PART_ID,
            documentId: null,
            createdAt: '2026-09-21T12:00:00.000Z',
            sourceFilename: 'kawasaki-fx921v.pdf',
            section: 'CARBURETOR',
            position: '1',
            page: 1,
          }],
        },
      });
    },
  );

  await login(page);
  await page.goto('/dashboard?tab=favorites');
  await expect(page.getByText(CODE, { exact: true })).toBeVisible();

  await expectKawasakiInDraft(page, () => page.getByTitle('Adicionar ao orçamento').click());
});

test('histórico preserva fabricante real no orçamento em vez de presumir Husqvarna', async ({ page }) => {
  await page.route(
    url => url.pathname.endsWith('/api/history'),
    route => route.fulfill({
      json: {
        history: [{
          id: 'history-kawasaki-e2e',
          query: CODE,
          pnc: null,
          status: 'FOUND',
          resultPartId: PART_ID,
          resultLabel: 'GASKET',
          resultCode: CODE,
          resultModel: 'FX921V-ES06',
          resultPnc: null,
          sourceFilename: 'kawasaki-fx921v.pdf',
          createdAt: '2026-09-21T12:00:00.000Z',
        }],
      },
    }),
  );

  await login(page);
  await page.goto('/dashboard?tab=history');
  await expect(page.getByText(CODE, { exact: true })).toBeVisible();

  await expectKawasakiInDraft(page, () => page.getByTitle('Adicionar ao orçamento').click());
});
