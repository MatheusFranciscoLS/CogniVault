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
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  // Âncora pós-login: o campo de busca, que é o elemento funcional da tela.
  // O título decorativo que servia de âncora saiu — três cabeçalhos empilhados
  // diziam a mesma coisa antes da busca.
  await expect(page.getByPlaceholder(/Código, peça, modelo|Peça, código ou pergunta/)).toBeVisible();
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

test('PNC da etiqueta abre a vista explodida no painel lateral, sem trocar de tela', async ({ page }) => {
  await login(page, MECHANIC_EMAIL);

  // A aba Máquinas não existe mais: o balcão escreve no campo único e o PNC da
  // etiqueta abre a máquina ao lado, com a busca de peças intacta atrás.
  await expect(page.getByRole('button', { name: 'Máquinas' })).toHaveCount(0);

  const painel = page.getByRole('dialog', { name: 'Máquina aberta' });
  await expect(painel).toHaveCount(0);

  const busca = page.getByPlaceholder(/Código, peça, modelo|Peça, código ou pergunta/);
  await busca.fill('967 79 63-01');
  await page.getByRole('button', { name: 'Buscar' }).click();

  await expect(painel).toBeVisible();
  await expect(painel.getByText('HUSQVARNA 545 Mark II').first()).toBeVisible();
  await expect(painel.getByText('FILTRO DE AR')).toBeVisible();
  await expect(painel.getByText('537041901', { exact: false })).toBeVisible();

  // Fechar devolve o atendimento no mesmo lugar, que é o ponto de ser lateral.
  await painel.getByRole('button', { name: 'Fechar' }).click();
  await expect(painel).toHaveCount(0);
  await expect(busca).toBeVisible();
});

test('código de peça com a MESMA máscara do PNC não abre máquina', async ({ page }) => {
  await login(page, MECHANIC_EMAIL);

  // `587 10 67-01` é código de peça e usa a máscara idêntica à da etiqueta. O
  // que separa os dois é o prefixo 9 do PNC, e é esta a regressão que o balcão
  // sentiria primeiro: buscar uma peça e receber a tela de máquina.
  await page.getByPlaceholder(/Código, peça, modelo|Peça, código ou pergunta/).fill('587 10 67-01');
  await page.getByRole('button', { name: 'Buscar' }).click();

  await expect(page.getByRole('dialog', { name: 'Máquina aberta' })).toHaveCount(0);
});

test('link antigo de ?tab=machines&pnc= continua abrindo a máquina', async ({ page }) => {
  await login(page, MECHANIC_EMAIL);

  // Links salvos e abas abertas antes do deploy apontam para a aba que saiu.
  // Eles caem no Atendimento e o painel já nasce aberto no mesmo PNC.
  await page.goto(`/dashboard?tab=machines&pnc=${PNC}`);

  const painel = page.getByRole('dialog', { name: 'Máquina aberta' });
  await expect(painel).toBeVisible();
  await expect(painel.getByText('HUSQVARNA 545 Mark II').first()).toBeVisible();
});

test('posição da vista explodida leva o código para a busca interna', async ({ page }) => {
  await login(page, MECHANIC_EMAIL);

  await page.goto(`/dashboard?tab=machines&pnc=${PNC}`);
  const painel = page.getByRole('dialog', { name: 'Máquina aberta' });
  await expect(painel.getByText('HUSQVARNA 545 Mark II').first()).toBeVisible();

  await painel.getByRole('button', { name: 'Consultar interno' }).click();

  // O painel fecha e o código cai no campo de busca, sem recarregar a página.
  await expect(painel).toHaveCount(0);
  await expect(page.getByPlaceholder(/Código, peça, modelo|Peça, código ou pergunta/)).toHaveValue(/537041901/);
});

test('máquina consultada entra na lista de recentes do atendente', async ({ page }) => {
  await login(page, MECHANIC_EMAIL);

  await page.goto(`/dashboard?tab=machines&pnc=${PNC}`);
  const painel = page.getByRole('dialog', { name: 'Máquina aberta' });
  await expect(painel.getByText('HUSQVARNA 545 Mark II').first()).toBeVisible();
  await painel.getByRole('button', { name: 'Fechar' }).click();

  // Os recentes vivem no atendimento agora, e são o atalho que substitui o
  // campo de máquina da aba removida.
  await expect(page.getByRole('button', { name: 'HUSQVARNA 545 Mark II' })).toBeVisible();
});

test('preço indisponível mantém o código oficial visível e mostra a degradação', async ({ page }) => {
  const code = '15004-0937';
  await page.route(
    url => url.pathname.endsWith('/api/official-parts/by-code') && url.searchParams.get('code') === code,
    route => route.fulfill({
      json: {
        officialParts: [{
          source: 'KAWASAKI',
          engineModel: 'FX921V-ES06',
          assembly: 'CARBURETOR',
          position: '1',
          partNumber: code,
          name: 'GASKET',
          quantity: 1,
        }],
      },
    }),
  );
  await page.route(
    url => url.pathname.endsWith('/api/master-parts/prices'),
    route => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ prices: {}, degraded: true, error: 'Preço temporariamente indisponível.' }),
    }),
  );

  await login(page, MECHANIC_EMAIL);
  await page.getByPlaceholder(/Código, peça, modelo|Peça, código ou pergunta/).fill(code);
  await page.getByRole('button', { name: 'Buscar' }).click();

  await expect(page.getByText('FX921V-ES06', { exact: false })).toBeVisible();
  await expect(page.getByText(code, { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Preços da loja temporariamente indisponíveis' })).toBeVisible();
});
