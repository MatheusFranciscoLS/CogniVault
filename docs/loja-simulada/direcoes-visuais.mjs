// Mostra a MESMA tela do Atendimento (busca + orçamento) com direções visuais diferentes, trocando só os tokens
// de cor por cima do app real. Não é teste: serve para o dono escolher a identidade antes de qualquer código.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/direcoes-visuais.mjs
import { open, shot, SEARCH } from './_t.mjs';

const DIRECOES = {
  atual: '',
  grafite: `
    :root:root { --background:#f1f1ee; --foreground:#15191c; --card:#ffffff; --card-foreground:#15191c; --popover:#fff; --popover-foreground:#15191c;
      --primary:#f2b705; --primary-foreground:#15191c; --primary-hover:#d9a300; --secondary:#e7e7e2; --secondary-foreground:#15191c; --muted:#f7f7f4; --muted-foreground:#575d63;
      --accent:#ebebe5; --accent-foreground:#15191c; --border:#d8d8d2; --input:#c3c3bb; --ring:#b58900; --add:#7a5a00; --bar:#15191c; --bar-foreground:#fff;
      --ok:#0b6b3f; --ok-soft:#e2f3e9; --warn:#7a5200; --warn-soft:#fff0c2; --selected:#f6edc9; }
  `,
  azul: `
    :root:root { --background:#eef2f8; --foreground:#0f1b2d; --card:#ffffff; --card-foreground:#0f1b2d; --popover:#fff; --popover-foreground:#0f1b2d;
      --primary:#1d4ed8; --primary-foreground:#fff; --primary-hover:#1a3fb0; --secondary:#e1e8f4; --secondary-foreground:#0f1b2d; --muted:#f5f8fc; --muted-foreground:#52607a;
      --accent:#e3ebf8; --accent-foreground:#0f1b2d; --border:#d3dcec; --input:#bdc9e0; --ring:#1d4ed8; --add:#1d4ed8; --bar:#0b2545; --bar-foreground:#fff;
      --ok:#0a6b4a; --ok-soft:#e1f4ec; --warn:#7a5800; --warn-soft:#fff2c8; --selected:#e3ebf8; }
  `,
  verde: `
    :root:root { --background:#eef1ee; --foreground:#14201c; --card:#ffffff; --card-foreground:#14201c; --popover:#fff; --popover-foreground:#14201c;
      --primary:#0f766e; --primary-foreground:#fff; --primary-hover:#0b5f58; --secondary:#e2e8e4; --secondary-foreground:#14201c; --muted:#f5f8f6; --muted-foreground:#52625b;
      --accent:#e3ece7; --accent-foreground:#14201c; --border:#d5ddd8; --input:#bfcbc4; --ring:#0f766e; --add:#0f766e; --bar:#15302b; --bar-foreground:#fff;
      --ok:#0a6b4a; --ok-soft:#e1f4ec; --warn:#7a5800; --warn-soft:#fff2c8; --selected:#e0eee8; }
  `,
};

const quais = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(DIRECOES);
for (const nome of quais) {
  const { browser, page } = await open({ theme: 'light' });
  if (DIRECOES[nome]) await page.addStyleTag({ content: DIRECOES[nome] });
  const campo = page.getByPlaceholder(SEARCH);
  await campo.fill('carburador 143RII');
  await campo.press('Enter');
  await page.waitForTimeout(3500);
  const add = page.locator('[data-row-add]');
  await add.nth(0).click(); await add.nth(2).click();
  await page.waitForTimeout(500);
  await shot(page, `dir-${nome}`);
  await browser.close();
}
console.log('ok');
