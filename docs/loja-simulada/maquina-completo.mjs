// Percorre TODO o conteúdo do painel da máquina na LOJA SIMULADA e diz o que passou e o que falhou.
// Regra do dono: toda tela aberta é testada em todo o conteúdo, não só no que aparece no topo.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/maquina-completo.mjs [PNC=967332901] [tema=dark]
import { open, check, step, finish, OUT, BASE } from './_t.mjs';
import path from 'node:path';

// Aceita `[PNC] [tema]` e também só `[tema]` (como o todos-roteiros.sh chama os outros).
const args = process.argv.slice(2);
const temaArg = args.find(a => a === 'dark' || a === 'light');
const pnc = args.find(a => /^\d{9,}$/.test(a)) ?? '967332901';
const theme = temaArg ?? 'dark';

const { browser, page, errors } = await open({ theme });
await page.goto(`${BASE}/dashboard?tab=machines&pnc=${pnc}`);

const painel = page.getByRole('dialog', { name: 'Máquina aberta' });
await painel.waitFor({ timeout: 20000 });
await painel.getByRole('region', { name: 'Vistas explodidas da máquina' }).waitFor({ timeout: 30000 });
const rows = () => painel.locator('article');

await step('cabeçalho', async () => {
  const titulo = await painel.locator('header h2:not(.sr-only)').first().innerText();
  check('cabeçalho mostra o nome da máquina', titulo.length > 3 && !/^PNC/.test(titulo), titulo);
  check('cabeçalho mostra o PNC', (await painel.innerText()).includes(pnc));
  await painel.getByRole('button', { name: `Copiar PNC ${pnc}` }).click();
  check('copiar PNC põe o PNC na área de transferência', (await page.evaluate(() => navigator.clipboard.readText())) === pnc);
});

await step('documentos', async () => {
  const docs = painel.getByRole('group', { name: 'Documentos oficiais' }).getByRole('link');
  const n = await docs.count();
  // Só vista de peças (IPL): manual do operador não aparece no balcão. Máquina que só tem manual fica sem a fileira.
  check('nenhum atalho é manual do operador', !(await docs.allInnerTexts()).some(texto => /Manual/i.test(texto)), `${n} atalhos`);
  for (let i = 0; i < n; i++) {
    const href = await docs.nth(i).getAttribute('href');
    check(`documento ${i + 1} é link https da Husqvarna`, /^https:\/\/[^/]*(husqvarna|aprimocdn)/.test(href ?? ''), href?.slice(0, 70));
  }
});

await step('variantes', async () => {
  const botao = painel.getByRole('button', { name: /^Variante / });
  if (await botao.count() === 0) { check('menu de variantes (máquina sem variantes)', true); return; }
  await botao.click();
  const itens = page.getByRole('menuitem');
  check('menu de variantes abre e lista os PNCs', (await itens.count()) >= 2, `${await itens.count()} itens`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  check('Esc fecha só o menu, não o painel', (await page.getByRole('menuitem').count()) === 0 && (await painel.count()) === 1);
});

await step('portal', async () => {
  const link = painel.getByRole('link', { name: /Portal Husqvarna/ });
  check('link do Portal existe e é https', /^https:/.test((await link.getAttribute('href')) ?? ''));
});

await step('busca dentro da máquina', async () => {
  const campo = painel.getByLabel('Buscar nesta máquina');
  await campo.fill('carburador');
  const sugestao = painel.locator('button', { hasText: /posição/ }).first();
  await sugestao.waitFor({ timeout: 5000 });
  const texto = await sugestao.innerText();
  await sugestao.click();
  await page.waitForTimeout(500);
  check('escolher um resultado leva à vista e destaca a linha', (await painel.locator('article.border-primary').count()) >= 1, texto.replace(/\n/g, ' | ').slice(0, 80));
  check('o campo de busca é limpo depois de escolher', (await campo.inputValue()) === '');
  await campo.fill('zzzqqq');
  check('busca sem resultado avisa', await painel.getByText('Nada encontrado nas vistas desta máquina.').isVisible());
  await campo.fill('');
});

const secoes = painel.getByRole('navigation', { name: 'Vistas da máquina' }).getByRole('button');
const totalSecoes = await secoes.count();
check('lista de vistas carregada', totalSecoes > 0, `${totalSecoes} vistas`);

const problemas = [];
for (let i = 0; i < totalSecoes; i++) {
  await secoes.nth(i).click();
  await page.waitForTimeout(250);
  const nome = (await secoes.nth(i).innerText()).split('\n')[0];
  const img = painel.locator('img[alt^="Vista explodida"]').first();
  let imgOk = true;
  if (await img.count()) {
    imgOk = await img.evaluate(el => new Promise(res => { if (el.complete) res(el.naturalWidth > 0); else { el.onload = () => res(el.naturalWidth > 0); el.onerror = () => res(false); setTimeout(() => res(el.naturalWidth > 0), 8000); } }));
  }
  const linhas = await rows().count();
  const semCodigo = await painel.locator('article', { hasText: 'Sem código nesta vista' }).count();
  const botoesCodigo = await painel.locator('article button[aria-label^="Copiar código"]').count();
  const pontos = await painel.locator('[data-hotspot]').count();
  if (!imgOk) problemas.push(`${nome}: imagem não carregou`);
  if (linhas === 0) problemas.push(`${nome}: sem nenhuma peça`);
  if (botoesCodigo + semCodigo !== linhas) problemas.push(`${nome}: ${linhas} linhas, ${botoesCodigo} com código e ${semCodigo} sem`);
  console.log(`   vista ${i + 1}/${totalSecoes} ${nome}: ${linhas} peças, ${botoesCodigo} códigos, ${pontos} posições clicáveis, imagem ${imgOk ? 'ok' : 'FALHOU'}`);
}
check('todas as vistas abrem com imagem e peças', problemas.length === 0, problemas.slice(0, 5).join(' ; '));

await step('numa vista com posições: clicar no número leva à linha', async () => {
  await secoes.nth(0).click();
  await page.waitForTimeout(400);
  // Alguns números ficam um sobre o outro nas coordenadas da própria Husqvarna (ex.: duas peças na posição 7).
  // Testa o primeiro que está livre para o clique.
  const todos = painel.locator('[data-hotspot] button');
  let ponto = null;
  for (let i = 0; i < await todos.count(); i++) {
    const livre = await todos.nth(i).evaluate(el => { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el; });
    if (livre) { ponto = todos.nth(i); break; }
  }
  if (!ponto) throw new Error('nenhum número livre nesta vista');
  const rotulo = (await ponto.innerText()).trim();
  await ponto.click();
  await page.waitForTimeout(500);
  const destaque = painel.locator('article.border-primary');
  check('hotspot destaca a linha da peça', (await destaque.count()) === 1, `posição ${rotulo}`);
  check('a linha destacada tem a mesma posição do número clicado', ((await destaque.first().locator('span[title^="Posição"]').first().innerText()).trim()) === rotulo);
});

await step('zoom', async () => {
  const texto = () => painel.getByText(/^\d+%$/).first().innerText();
  const antes = await texto();
  await painel.getByRole('button', { name: 'Aumentar zoom' }).click();
  await painel.getByRole('button', { name: 'Aumentar zoom' }).click();
  check('aumentar zoom muda a porcentagem', (await texto()) !== antes, `${antes} → ${await texto()}`);
  await painel.getByRole('button', { name: 'Ajustar à tela' }).click();
  check('"Ajustar à tela" volta a 100%', (await texto()) === '100%');
  check('diminuir zoom está desabilitado em 100%', await painel.getByRole('button', { name: 'Diminuir zoom' }).isDisabled());
});

await step('copiar código de uma peça', async () => {
  const botao = painel.locator('article button[aria-label^="Copiar código"]').first();
  const exibido = (await botao.innerText()).trim();
  await botao.click();
  const copiado = await page.evaluate(() => navigator.clipboard.readText());
  check('copiar põe o código SEM espaços e traço (formato do Clipp)', /^[A-Z0-9]+$/.test(copiado) && copiado === exibido.replace(/[^A-Za-z0-9]/g, ''), `${exibido} → ${copiado}`);
});

await step('+ Orçamento', async () => {
  const linha = rows().first();
  await linha.getByRole('button', { name: /^\+ Orçamento/ }).click();
  await page.waitForTimeout(600);
  check('o botão da peça muda para "No orçamento · 1"', await linha.getByRole('button', { name: /No orçamento · 1/ }).isVisible());
  await linha.getByRole('button', { name: /No orçamento · 1/ }).click();
  await page.waitForTimeout(400);
  check('clicar de novo soma a quantidade', await linha.getByRole('button', { name: /No orçamento · 2/ }).isVisible());
});

await step('seleção de várias peças', async () => {
  const caixas = painel.getByRole('checkbox');
  await caixas.nth(1).check();
  await caixas.nth(2).check();
  check('barra de seleção aparece com a contagem', await painel.getByText('2 peças selecionadas').isVisible());
  await painel.getByRole('button', { name: 'Limpar' }).click();
  check('"Limpar" some com a barra', (await painel.getByText(/peças? selecionadas?/).count()) === 0);
  await painel.getByRole('button', { name: 'Selecionar todas desta vista' }).click();
  const n = await painel.getByRole('checkbox', { checked: true }).count();
  check('"Selecionar todas desta vista" marca as peças com código', n > 0, `${n} marcadas`);
  await painel.getByRole('button', { name: 'Adicionar ao orçamento' }).click();
  await page.waitForTimeout(800);
  const noOrcamento = await painel.getByRole('button', { name: /No orçamento/ }).count();
  check('adicionar selecionadas põe todas no orçamento', noOrcamento >= n, `${noOrcamento} botões "No orçamento"`);
});

await step('menu ⋯ da peça', async () => {
  await painel.getByRole('button', { name: /Mais ações para/ }).first().click();
  check('menu tem "Ver preço e estoque" e "Ver na Husqvarna"', (await page.getByRole('menuitem', { name: 'Ver preço e estoque' }).isVisible()) && (await page.getByRole('menuitem', { name: 'Ver na Husqvarna' }).isVisible()));
  await page.keyboard.press('Escape');
});

await step('peças relacionadas', async () => {
  const aba = painel.getByRole('tab', { name: /Peças relacionadas/ });
  if (await aba.count() === 0) { check('aba de peças relacionadas (não existe nesta máquina)', true); return; }
  await aba.click();
  await page.waitForTimeout(500);
  const linhas = await rows().count();
  const codigos = await painel.locator('article button[aria-label^="Copiar código"]').count();
  check('peças relacionadas listam peças com código', linhas > 0 && codigos === linhas, `${linhas} peças, ${codigos} códigos`);
  await painel.getByRole('button', { name: /^\+ Orçamento/ }).first().click();
  await page.waitForTimeout(500);
  check('adicionar peça relacionada funciona', (await painel.getByRole('button', { name: /No orçamento/ }).count()) >= 1);
  await painel.getByRole('tab', { name: /Vistas explodidas/ }).click();
});

await step('kit de manutenção e fim do painel', async () => {
  const rolagem = painel.locator('.overflow-y-auto').last();
  await painel.evaluate(el => { el.querySelectorAll('.overflow-y-auto').forEach(n => { n.scrollTop = n.scrollHeight; }); });
  await page.waitForTimeout(500);
  const kit = painel.getByRole('region', { name: 'Kit de manutenção' });
  if (await kit.count()) {
    check('kit de manutenção tem peças com código', (await kit.locator('li').count()) > 0, `${await kit.locator('li').count()} itens`);
    await kit.getByRole('button', { name: 'Adicionar kit ao orçamento' }).click();
    check('adicionar kit não quebra a tela', await painel.isVisible());
  } else check('kit de manutenção (modelo sem cobertura no catálogo interno: some, como deve)', true);
  await page.screenshot({ path: path.join(OUT, `${theme}-1366-maquina-fim.png`) });
  void rolagem;
});

await step('orçamento recebeu os itens', async () => {
  const draft = await page.evaluate(() => fetch('/api/quotes/draft', { credentials: 'include' }).then(r => r.json()));
  const itens = draft?.quote?.items ?? draft?.items ?? [];
  await page.waitForTimeout(2500);
  const draft2 = await page.evaluate(() => fetch('/api/quotes/draft', { credentials: 'include' }).then(r => r.json()));
  const n = (draft2?.quote?.items ?? draft2?.items ?? itens).length;
  check('o rascunho no servidor tem os itens adicionados', n >= 2, `${n} itens`);
  check('itens do orçamento vieram com preço ou sem, mas com código e modelo', (draft2?.quote?.items ?? draft2?.items ?? []).every(i => i.partNumber && i.model !== undefined));
});

await step('ver preço e estoque + Esc', async () => {
  await painel.getByRole('button', { name: /Mais ações para/ }).first().click();
  await page.getByRole('menuitem', { name: 'Ver preço e estoque' }).click();
  await page.waitForTimeout(600);
  check('"Ver preço e estoque" fecha o painel e preenche a busca', (await painel.count()) === 0 && (await page.getByPlaceholder(/Código, peça ou modelo|Peça, código ou pergunta/).inputValue()).length > 4);
  await page.goto(`${BASE}/dashboard?tab=machines&pnc=${pnc}`);
  await painel.waitFor({ timeout: 20000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('Esc fecha o painel', (await painel.count()) === 0);
});

// Limpa o que o teste pôs no orçamento.
await page.evaluate(() => fetch('/api/quotes/draft', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [], options: {} }) }));
await finish(browser, errors);
