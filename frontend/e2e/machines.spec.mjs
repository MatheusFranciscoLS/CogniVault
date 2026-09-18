import { test, expect } from '@playwright/test';

const PASSWORD = 'CogniVault-E2E-2026!';
const MECHANIC_EMAIL = 'mecanico.e2e@cognivault.local';

// PNC real da linha Husqvarna (9 dígitos, começa com 9 — padrão confirmado
// pelo proprietário). A resposta abaixo é 100% fabricada para o teste: não
// reproduz nenhum dado real do Portal Husqvarna, só usa um identificador
// real como chave de busca.
const PNC = '967796301';

const officialFallbackFixture = {
  result: {
    status: 'FOUND',
    source: 'OFFICIAL',
    kind: 'PRODUCT_CATALOG',
    query: PNC,
    pnc: PNC,
    name: 'HUSQVARNA 545 Mark II',
    categoryName: 'Motosserras',
    articleDescription: 'Motosserra profissional 545 Mark II',
    discontinued: false,
    portalUrl: `https://portal.husqvarnagroup.com/br/motosserras/545-mark-ii/?article=${PNC}`,
    iplSections: [{ id: 'sec-motor', name: 'Motor', imageUrl: null, referenceHeight: null, referenceWidth: null }],
  },
};

const productDetailsFixture = {
  product: {
    pnc: PNC,
    productName: 'HUSQVARNA 545 Mark II',
    model: '545 Mark II',
    categoryName: 'Motosserras',
    articleDescription: 'Motosserra profissional 545 Mark II',
    discontinued: false,
    equipment: null,
    portalUrl: `https://portal.husqvarnagroup.com/br/motosserras/545-mark-ii/?article=${PNC}`,
    publicSupportUrl: null,
    publicSupportVerifiedBy: null,
    documents: [],
    specifications: [],
    variants: [],
    features: [],
    accessories: [],
    alsoUsedIn: [],
    spareParts: [],
    iplSections: [
      {
        id: 'sec-motor',
        name: 'Motor',
        imageUrl: null,
        referenceHeight: null,
        referenceWidth: null,
        parts: [
          {
            position: '12',
            partNumber: '537041901',
            name: 'FILTRO DE AR',
            description: null,
            quantity: 1,
            comment: null,
            coordinates: null,
            url: null,
            replacementPartNumbers: [],
            commercial: null,
          },
        ],
      },
    ],
  },
};

async function login(page, email) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar no CogniVault' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Encontre a peça certa. Entenda por quê.' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // A vista explodida vem do Portal Husqvarna real (rede externa fora do
  // controle do CI); a interação do balcão com a resposta é o que este teste
  // cobre, então o transporte é substituído por uma resposta fixa e
  // determinística em vez de depender do site ao vivo.
  // page.route com string usa glob (onde "?" casa um único caractere), o que
  // quebraria a query string literal "?q=...". Um predicado sobre a URL
  // evita essa armadilha.
  await page.route(
    url => url.pathname.endsWith('/api/official-fallback') && url.searchParams.get('q') === PNC,
    route => route.fulfill({ json: officialFallbackFixture }),
  );
  await page.route(
    url => url.pathname.endsWith(`/api/husqvarna/products/${PNC}/details`),
    route => route.fulfill({ json: productDetailsFixture }),
  );
});

test('abrir máquina por PNC mostra a vista explodida sem precisar de PDF', async ({ page }) => {
  await login(page, MECHANIC_EMAIL);

  await page.getByRole('button', { name: 'Máquinas' }).click();
  await expect(page).toHaveURL(/tab=machines/);

  const input = page.getByPlaceholder(/Modelo da máquina ou PNC da etiqueta/);
  await input.fill(PNC);
  await page.getByRole('button', { name: 'Abrir máquina' }).click();

  await expect(page.getByText('HUSQVARNA 545 Mark II').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Motor/ })).toBeVisible();
  await expect(page.getByText('FILTRO DE AR')).toBeVisible();
  await expect(page.getByText('537041901', { exact: false })).toBeVisible();

  // Recarregar preserva o PNC pela URL, sem precisar digitar de novo.
  await page.reload();
  await expect(page.getByText('HUSQVARNA 545 Mark II').first()).toBeVisible();
});

test('posição da vista explodida leva o código para a busca interna', async ({ page }) => {
  await login(page, MECHANIC_EMAIL);

  await page.goto(`/dashboard?tab=machines&pnc=${PNC}`);
  await expect(page.getByText('HUSQVARNA 545 Mark II').first()).toBeVisible();

  await page.getByRole('button', { name: 'Consultar interno' }).click();

  await expect(page).toHaveURL(/tab=parts|[?&]q=/);
  await expect(page.getByPlaceholder(/Código, peça, modelo|Peça, código ou pergunta/)).toHaveValue(/537041901/);
});

test('máquina consultada entra na lista de recentes do atendente', async ({ page }) => {
  await login(page, MECHANIC_EMAIL);

  await page.goto(`/dashboard?tab=machines&pnc=${PNC}`);
  await expect(page.getByText('HUSQVARNA 545 Mark II').first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'HUSQVARNA 545 Mark II' })).toBeVisible();
});
