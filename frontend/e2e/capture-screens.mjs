import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Tira prints das telas que o atendente usa, em três larguras e dois temas.
 *
 * **Por que existe.** Avaliar o visual por print mandado à mão não escala e não
 * é repetível: quem olha vê o que foi fotografado, e o "depois" nunca é
 * fotografado igual ao "antes". Aqui o mesmo roteiro roda contra um ambiente
 * descartável do CI (Postgres + seed + backend + frontend reais), então antes e
 * depois de uma mudança visual saem comparáveis pixel a pixel.
 *
 * **Roda só em dado de teste.** O login usa o usuário do seed (`admin.e2e`), que
 * é o dado público do próprio workflow. Nunca aponta para a produção.
 *
 * **Não é teste e não reprova.** Cada passo roda em try/catch: se um botão não
 * existe naquela largura (a barra do orçamento some no celular, por exemplo), o
 * print sai mesmo assim e o log diz qual passo falhou. Uma captura que aborta na
 * primeira falha esconde justamente as telas que quebram no tablet.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'CogniVault-E2E-2026!';
const ADMIN_EMAIL = 'admin.e2e@cognivault.local';
const OUT = process.env.SCREENS_DIR ?? 'screens';

// O alvo é o PC do balcão (dono, 2026-10-06: não há tablet na loja, e celular só o
// pessoal). A resolução real do PC ainda não foi confirmada, então cobrimos o
// notebook/monitor pequeno e o monitor comum. Celular é só teste de fumaça: não
// pode quebrar, mas ninguém otimiza para ele.
const VIEWPORTS = {
  'pc-1366': { width: 1366, height: 768 },
  'pc-1920': { width: 1920, height: 1080 },
  celular: { width: 390, height: 844 },
};
const THEMES = ['light', 'dark'];
const SEARCH = /Código, peça, modelo|Peça, código ou pergunta/;

mkdirSync(OUT, { recursive: true });

for (const theme of THEMES) {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    // Fumaça de celular só no tema claro: 8 prints a menos sem perder o aviso.
    if (viewportName === 'celular' && theme === 'dark') continue;
    test.describe(`${theme}-${viewportName}`, () => {
      test.use({ viewport, colorScheme: theme });

      test('telas do balcão', async ({ page }) => {
        const falhas = [];

        // O tema é escolhido por localStorage (ThemeProvider, 'vite-ui-theme').
        await page.addInitScript(valor => {
          try { localStorage.setItem('vite-ui-theme', valor); } catch { /* sem storage */ }
        }, theme);

        const shot = async nome => {
          await page.waitForTimeout(700);
          await page.screenshot({ path: `${OUT}/${theme}-${viewportName}-${nome}.png` });
        };

        const passo = async (nome, acao) => {
          try { await acao(); } catch (error) {
            falhas.push(nome);
            console.log(`[${theme}-${viewportName}] passo "${nome}" falhou: ${String(error.message).split('\n')[0]}`);
          }
        };

        await passo('login', async () => {
          await page.goto('/login');
          await page.getByLabel('E-mail').waitFor();
        });
        await shot('01-login');

        await passo('entrar', async () => {
          await page.getByLabel('E-mail').fill(ADMIN_EMAIL);
          await page.locator('#login-password').fill(PASSWORD);
          await page.getByRole('button', { name: 'Entrar', exact: true }).click();
          await page.waitForURL(/\/dashboard/);
          await page.getByPlaceholder(SEARCH).waitFor();
        });
        // O rascunho do orçamento mora no SERVIDOR e é por usuário. Todas as
        // sessões usam o mesmo usuário do seed, então a segunda já encontrava a
        // peça na cesta: o botão virava "No orçamento" e o clique em
        // "+ Orçamento" esperava para sempre. Esvaziar e recarregar dá a cada
        // sessão o mesmo ponto de partida.
        await passo('limpar rascunho', async () => {
          await page.evaluate(() => fetch('/api/quotes/draft', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: [], options: {} }),
          }));
          await page.reload();
          await page.getByPlaceholder(SEARCH).waitFor();
        });
        await shot('02-atendimento-vazio');

        await passo('buscar', async () => {
          await page.getByPlaceholder(SEARCH).fill('carburador 143RII 967332904');
          await page.getByRole('button', { name: 'Buscar' }).click();
          await page.getByRole('button', { name: 'Abrir detalhes de CARBURADOR' }).waitFor();
        });
        await shot('03-resultados');

        await passo('detalhe da peça', async () => {
          await page.getByRole('button', { name: 'Abrir detalhes de CARBURADOR' }).click();
          await page.getByRole('dialog').waitFor();
        });
        await shot('04-detalhe-da-peca');

        await passo('fechar detalhe', async () => {
          await page.keyboard.press('Escape');
          await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5_000 });
        });

        await passo('orçamento', async () => {
          await page.getByRole('button', { name: '+ Orçamento' }).first().click();
          // A barra lateral some em largura estreita; o botão do cabeçalho fica.
          const barra = page.getByRole('button', { name: 'Revisar orçamento' });
          if (await barra.isVisible().catch(() => false)) await barra.click();
          else await page.getByRole('button', { name: /^Orçamento/ }).first().click();
          await page.waitForTimeout(500);
        });
        await shot('05-orcamento');

        await passo('catálogos', async () => {
          await page.goto('/dashboard?tab=catalogs');
          await page.getByPlaceholder(/.+/).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
        });
        await shot('06-catalogos');

        await passo('orçamentos salvos', async () => { await page.goto('/dashboard?tab=quotes'); });
        await shot('07-orcamentos-salvos');

        await passo('visão geral (admin)', async () => { await page.goto('/dashboard?tab=overview'); });
        await shot('08-visao-geral-admin');

        console.log(`[${theme}-${viewportName}] concluído; passos com falha: ${falhas.length ? falhas.join(', ') : 'nenhum'}`);
      });
    });
  }
}
