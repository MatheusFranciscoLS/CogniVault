// Motor no orçamento + atalhos dos últimos motores digitados (pedido do dono, 2026-10-08).
// O atendente marca "Motor no orçamento" no cartão do motor; a gaveta mostra "Motor ...", o WhatsApp leva a linha "Motor:" (e nenhum
// código de peça), o PDF idem, e o motor sobrevive ao recarregar e ao arquivar. Tirar o motor e esvaziar o orçamento soltam o motor.
// Precisa de internet (Portal Husqvarna) para abrir a máquina. Uso (de dentro de frontend/): node ../docs/loja-simulada/motor-orcamento.mjs [tema]
import { open, check, step, finish, shot, confirmar, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });

await page.addInitScript(() => {
  window.open = () => ({ closed: false, close() {}, focus() {}, location: {} });
});
await page.reload();

const fechar = async () => {
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
};

async function abrirMaquina(busca) {
  if (await page.getByRole('dialog').count()) await fechar();
  await page.getByPlaceholder(SEARCH).fill(busca);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const fichas = page.locator('button:has(.font-code)', { hasText: 'PNC' });
  await fichas.first().waitFor({ timeout: 40000 });
  await fichas.first().click();
  const painel = page.getByRole('dialog').first();
  const cartao = painel.getByRole('region', { name: 'Motor desta máquina' });
  await cartao.waitFor({ timeout: 40000 });
  return { painel, cartao };
}

const abrirGaveta = async () => {
  if (await page.getByRole('dialog').count()) await fechar();
  await page.getByRole('button', { name: 'Revisar orçamento' }).click();
  const gaveta = page.getByRole('dialog').first();
  await gaveta.waitFor();
  await page.waitForTimeout(500);
  return gaveta;
};

await step('Motor da máquina vai para o orçamento com um clique, e o clique de novo tira', async () => {
  const { cartao } = await abrirMaquina('LTH1842');
  const botao = cartao.getByRole('button', { name: /^Motor no orçamento/ }).first();
  check('o botão existe no motor com modelo', (await botao.count()) === 1);
  check('começa desmarcado', (await botao.getAttribute('aria-pressed')) === 'false');
  await botao.click();
  await page.waitForTimeout(300);
  check('marcado depois do clique', (await botao.getAttribute('aria-pressed')) === 'true');
  check('o texto confirma com o visto', /✓/.test(await botao.innerText()));
  await botao.click();
  await page.waitForTimeout(300);
  check('o segundo clique tira', (await botao.getAttribute('aria-pressed')) === 'false');
  await botao.click();
  await page.waitForTimeout(300);
  await shot(page, `${theme}-1366-motor-orcamento-cartao`);
});

await step('A peça entra e a gaveta mostra o motor, com a saída "Tirar"', async () => {
  if (await page.getByRole('dialog').count()) await fechar();
  await page.getByPlaceholder(SEARCH).fill('carburador 143RII');
  await page.getByPlaceholder(SEARCH).press('Enter');
  await page.getByRole('button', { name: 'Buscar', exact: true }).waitFor({ timeout: 40000 });
  await page.waitForTimeout(5000);
  await page.getByRole('button', { name: /^\+ Orçamento/ }).first().click();
  await page.waitForTimeout(800);
  const gaveta = await abrirGaveta();
  check('a linha do motor aparece com o modelo', (await gaveta.innerText()).includes('Motor') && /Kohler SV540-3212/.test(await gaveta.innerText()));
  const previa = gaveta.getByLabel('Mensagem do WhatsApp');
  if (await previa.count() === 0) await gaveta.getByRole('button', { name: /WhatsApp|mensagem|Prévia/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  const texto = (await gaveta.innerText());
  await shot(page, `${theme}-1366-motor-orcamento-gaveta`);
  check('a gaveta tem o botão para tirar o motor', (await gaveta.getByRole('button', { name: /^Tirar o motor/ }).count()) === 1, texto.slice(0, 60));
});

await step('A mensagem do WhatsApp leva "Motor:" e nenhum código de peça', async () => {
  const gaveta = page.getByRole('dialog').first();
  const previa = gaveta.getByLabel('Mensagem do WhatsApp');
  let mensagem = '';
  if (await previa.count()) mensagem = await previa.innerText();
  else {
    await gaveta.getByRole('button', { name: /Ver mensagem|Mensagem|Prévia/i }).first().click().catch(() => {});
    await page.waitForTimeout(300);
    mensagem = await gaveta.getByLabel('Mensagem do WhatsApp').innerText().catch(() => '');
  }
  check('a linha do motor está na mensagem', /Motor: Kohler SV540-3212/.test(mensagem), mensagem.slice(0, 160).replace(/\n/g, ' | '));
  check('nenhum código de 9 dígitos na mensagem', !/\b\d{9}\b/.test(mensagem));
});

await step('Recarregar a página mantém o motor no orçamento', async () => {
  await page.reload();
  await page.getByPlaceholder(SEARCH).waitFor();
  await page.waitForTimeout(1500);
  const gaveta = await abrirGaveta();
  check('o motor continua lá', /Kohler SV540-3212/.test(await gaveta.innerText()));
});

await step('Tirar o motor na gaveta o remove da mensagem', async () => {
  const gaveta = page.getByRole('dialog').first();
  await gaveta.getByRole('button', { name: /^Tirar o motor/ }).click();
  await page.waitForTimeout(400);
  check('a linha some da gaveta', (await gaveta.getByRole('button', { name: /^Tirar o motor/ }).count()) === 0);
  const mensagem = await gaveta.getByLabel('Mensagem do WhatsApp').innerText().catch(() => '');
  check('e da mensagem', !/Motor:/.test(mensagem), mensagem.slice(0, 80));
});

await step('Plaqueta digitada vira atalho: aparece como botão e reabre o motor com um clique', async () => {
  const { painel, cartao } = await abrirMaquina('LTH1842');
  const campo = cartao.locator('#engine-from-plate');
  await campo.fill('fx921v es06');
  await campo.press('Enter');
  await painel.getByRole('region', { name: /Motor Kawasaki FX921V-ES06/ }).first().waitFor({ timeout: 40000 });
  const atalhos = cartao.getByRole('group', { name: 'Últimos motores digitados' });
  check('o grupo de atalhos aparece', (await atalhos.count()) === 1);
  check('com o motor digitado', (await atalhos.getByRole('button', { name: /FX921V-ES06/ }).count()) === 1);
  await campo.fill('sv540 3212');
  await campo.press('Enter');
  await page.waitForTimeout(600);
  const nomes = await atalhos.getByRole('button').allInnerTexts();
  check('o mais novo vai na frente, sem repetir', nomes[0] === 'SV540-3212' && nomes.filter(n => n === 'FX921V-ES06').length === 1, nomes.join(' | '));
  await atalhos.getByRole('button', { name: /FX921V-ES06/ }).click();
  await painel.getByRole('region', { name: /Motor Kawasaki FX921V-ES06/ }).first().waitFor({ timeout: 40000 });
  check('clicar no atalho reabre o catálogo do motor', true);
  await shot(page, `${theme}-1366-motor-atalhos`);
});

await step('O motor digitado também pode ir para o orçamento', async () => {
  const { cartao } = { cartao: page.getByRole('dialog').first().getByRole('region', { name: 'Motor desta máquina' }) };
  const linha = cartao.locator('li').filter({ hasText: 'FX921V-ES06' }).first();
  await linha.getByRole('button', { name: /^Motor no orçamento/ }).click();
  await page.waitForTimeout(300);
  const gaveta = await abrirGaveta();
  check('a gaveta mostra Kawasaki FX921V-ES06', /Kawasaki FX921V-ES06/.test(await gaveta.innerText()));
});

await step('Esvaziar o orçamento solta o motor: o próximo cliente começa limpo', async () => {
  const gaveta = page.getByRole('dialog').first();
  await gaveta.getByRole('button', { name: 'Esvaziar', exact: true }).click();
  await confirmar(page, 'Esvaziar');
  await page.waitForTimeout(800);
  await page.reload();
  await page.getByPlaceholder(SEARCH).waitFor();
  await page.waitForTimeout(1500);
  const texto = await page.locator('body').innerText();
  check('nenhum motor sobra na tela depois de esvaziar e recarregar', !/Motor (Kawasaki|Kohler) /.test(texto.replace(/Motor desta máquina/g, '')));
});

await finish(browser, errors);
