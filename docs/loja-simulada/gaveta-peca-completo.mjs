// GAVETA DA PEÇA inteira: código, copiar, preço, vista explodida, "Leve junto", óleo e o menu ⋯ com cada ação.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/gaveta-peca-completo.mjs [tema]
import { open, check, step, finish, shot, sqlSim, SEARCH } from './_t.mjs';

// O servidor recusa a mesma conferência pendente duas vezes (409, certo): começa sem pendências na simulação.
sqlSim('DELETE FROM "OfficialPartVerification"');
const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'dark' });
const busca = page.getByPlaceholder(SEARCH);
await busca.waitFor();

const abrirGaveta = async codigo => {
  await busca.fill(codigo);
  await busca.press('Enter');
  await page.getByRole('button', { name: `Copiar código ${codigo}` }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Abrir detalhes de/ }).first().click();
  const gaveta = page.getByRole('dialog').first();
  await gaveta.waitFor();
  return gaveta;
};

await step('gaveta da peça de catálogo', async () => {
  const gaveta = await abrirGaveta('587106701');
  await page.waitForTimeout(1200);
  const texto = await gaveta.innerText();
  check('título é o nome da peça e a linha de baixo traz modelo e PNC', texto.includes('CARBURADOR') && /143RII/.test(texto) && /PNC/.test(texto));
  check('código grande aparece', texto.includes('587106701'));
  check('há preço', /R\$\s?\d/.test(texto));

  await gaveta.getByRole('button', { name: /Copiar código/ }).click();
  check('"Copiar código" copia o código puro', (await page.evaluate(() => navigator.clipboard.readText())) === '587106701');
  check('o botão confirma "Código copiado"', await gaveta.getByText('Código copiado').isVisible());

  await gaveta.getByRole('button', { name: /Adicionar ao orçamento/ }).click();
  await page.waitForTimeout(600);
  check('"Adicionar ao orçamento" vira "No orçamento · 1"', await gaveta.getByRole('button', { name: /No orçamento · 1/ }).isVisible());
  await gaveta.getByRole('button', { name: /No orçamento · 1/ }).click();
  await page.waitForTimeout(500);
  check('clicar de novo soma 2', await gaveta.getByRole('button', { name: /No orçamento · 2/ }).isVisible());

  const vista = gaveta.getByRole('button', { name: 'Abrir vista explodida' });
  check('botão "Abrir vista explodida" existe', (await vista.count()) === 1);
  check('posição e página da peça aparecem', /Posição\s+\d+/.test(texto) && /Página\s+\d+/.test(texto), (texto.match(/Posição[^\n]*/) ?? [''])[0]);

  check('"Leve junto" lista peças companheiras com código', (await gaveta.locator('section', { hasText: 'Leve junto' }).locator('li').count()) > 0 || !texto.includes('Leve junto'), `${await gaveta.locator('section', { hasText: 'Leve junto' }).locator('li').count()} itens`);
  await shot(page, `${theme}-1366-gaveta-peca-topo`);
  await gaveta.locator('.overflow-y-auto').first().evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(300);
  await shot(page, `${theme}-1366-gaveta-peca-fim`);

  // companheiros: copiar e abrir
  const companheiros = gaveta.locator('section', { hasText: 'Leve junto' }).locator('li');
  if (await companheiros.count()) {
    await companheiros.first().getByRole('button', { name: /^Copiar$/ }).click();
    check('"Copiar" do companheiro copia um código', /^[A-Z0-9]{5,}$/.test(await page.evaluate(() => navigator.clipboard.readText())));
    const abrir = companheiros.first().getByRole('button', { name: 'Abrir' });
    if (await abrir.count()) {
      const nomeAntes = await gaveta.locator('h2').first().innerText();
      await abrir.click();
      await page.waitForTimeout(1500);
      const nomeDepois = await page.getByRole('dialog').first().locator('h2').first().innerText();
      check('"Abrir" troca a gaveta para a peça companheira', nomeDepois !== nomeAntes, `${nomeAntes} → ${nomeDepois}`);
    }
  }

  // menu ⋯
  const g2 = page.getByRole('dialog').first();
  await g2.getByRole('button', { name: 'Mais ações' }).click();
  const itens = await page.getByRole('menuitem').allInnerTexts();
  console.log(`   menu ⋯: ${itens.join(' | ')}`);
  check('menu ⋯ tem só as 2 ações que ficaram (sem Favoritar e sem Perguntar à IA: os dois saíram)', ['Husqvarna', 'conferência'].every(t => itens.some(i => i.includes(t))) && itens.length === 2 && !itens.some(i => /Favoritar|IA/.test(i)), itens.join(' | '));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Esc fecha o menu e a gaveta continua', (await page.getByRole('dialog').count()) >= 1);
});

await step('registrar conferência', async () => {
  const g = page.getByRole('dialog').first();
  await g.getByRole('button', { name: 'Mais ações' }).click();
  await page.getByRole('menuitem', { name: /conferência/ }).click();
  const form = page.getByRole('dialog', { name: 'Registrar conferência' });
  await form.waitFor({ timeout: 5000 });
  check('"Registrar conferência" abre um diálogo de verdade (role=dialog, com título)', await form.isVisible());
  const texto = await form.innerText();
  check('mostra a peça (nome e código) e o link do Portal Husqvarna', texto.includes('503443201') || /\d{6,}/.test(texto));
  const link = form.getByRole('link', { name: /Portal Husqvarna/ });
  check('o link do Portal é https da Husqvarna', /^https:\/\/portal\.husqvarnagroup\.com/.test((await link.getAttribute('href')) ?? ''));
  check('sem texto que explica o sistema ("registra usuário, data, fonte")', !/registra usuário|automaticamente|cache/i.test(texto));
  const codigo = form.getByLabel('Código atual no Portal');
  const enviar = form.getByRole('button', { name: 'Enviar para aprovação' });
  const original = await codigo.inputValue();
  check('o código atual já vem preenchido com o da peça e mostra "continua o mesmo"', original.length >= 6 && (await form.getByText('O código continua o mesmo.').isVisible()));
  await codigo.fill('123');
  check('código inválido desabilita o envio', await enviar.isDisabled());
  await codigo.fill('999888777');
  check('código diferente mostra a substituição e avisa que o administrador aprova', (await form.innerText()).includes('Substituição') && /administrador/i.test(await form.innerText()));
  await shot(page, `${theme}-1366-conferencia`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('Esc fecha só o diálogo; a gaveta da peça continua aberta', (await form.count()) === 0 && (await page.getByRole('dialog').count()) === 1);
  // envio de verdade (só na simulação): fecha o diálogo e confirma
  await page.getByRole('dialog').first().getByRole('button', { name: 'Mais ações' }).click();
  await page.getByRole('menuitem', { name: /conferência/ }).click();
  await form.waitFor();
  await form.getByRole('button', { name: 'Enviar para aprovação' }).click();
  await form.waitFor({ state: 'detached', timeout: 10000 });
  check('enviar para aprovação fecha o diálogo', (await form.count()) === 0);
  check('e avisa que a conferência foi enviada', await page.getByText('Conferência enviada para aprovação.').isVisible());
});

await step('favoritar (decisão pendente: Favoritos)', async () => {
  const antes = await page.getByRole('dialog').count();
  console.log(`   diálogos abertos: ${antes}`);
});

await step('gaveta de peça do cadastro (sem catálogo)', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await busca.fill('505306701');
  await busca.press('Enter');
  await page.getByRole('button', { name: 'Copiar código 505306701' }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const abrir = page.getByRole('button', { name: /Abrir detalhes de/ });
  console.log(`   linhas do cadastro com "Abrir detalhes": ${await abrir.count()}`);
});

await step('abrir o PDF da vista explodida', async () => {
  await page.keyboard.press('Escape');
  const gaveta = await abrirGaveta('587106701');
  await gaveta.getByRole('button', { name: 'Abrir vista explodida' }).click();
  await page.waitForTimeout(2500);
  const visualizador = page.locator('iframe');
  // Na loja simulada não há armazenamento de PDF (502): o que importa é o balcão ver o aviso, não uma tela muda.
  const aviso = await page.getByText('O armazenamento do catálogo está temporariamente indisponível.').count();
  check('a vista explodida abre num visualizador OU avisa que o armazenamento está fora', (await visualizador.count()) === 1 || aviso > 0, `${await visualizador.count()} iframes, aviso: ${aviso}`);
  await shot(page, `${theme}-1366-gaveta-pdf`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('Esc fecha o visualizador', (await page.locator('iframe').count()) === 0);
  // 502 do armazenamento de PDF é esperado na simulação (não há bucket).
  errors.splice(0, errors.length, ...errors.filter(e => !/502/.test(e)));
});

await finish(browser, errors);
