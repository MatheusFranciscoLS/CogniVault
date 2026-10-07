// Tela ORÇAMENTOS (arquivo) inteira: contagem, filtros (texto e datas), linhas, itens, copiar código, retomar e excluir.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/orcamentos-completo.mjs [tema]
import { open, check, step, finish, shot, confirmar } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'dark' });

// Garante dados: dois orçamentos com cliente, para filtrar e retomar.
const criar = (cliente, codigo, preco) => page.evaluate(async ([cliente, codigo, preco]) => {
  const corpo = { items: [{ partNumber: codigo, name: `PEÇA ${codigo}`, model: '143RII', quantity: 2, unitPrice: preco }], options: { customerName: cliente, customerPhone: '19987654321', paymentMethod: 'Cartão de Débito', discountPercentage: 5 } };
  const r = await fetch('/api/quotes', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  return r.status;
}, [cliente, codigo, preco]);
console.log('   criando orçamentos de teste:', await criar('Maria Souza', '505306701', 15.22), await criar('João Pereira', '506744201', 10.87));

await page.getByRole('button', { name: 'Orçamentos', exact: true }).click();
const lista = page.locator('main');
await page.getByText(/orçamentos? arquivados?/).waitFor({ timeout: 15000 });

const pronto = async () => { await page.waitForTimeout(300); await page.getByText('Carregando orçamentos…').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {}); await page.waitForTimeout(200); };
const contagem = async () => Number(((await page.getByText(/\d+ orçamentos? arquivados?/).first().innerText()).match(/\d+/) ?? ['0'])[0]);
const total0 = await contagem();

await step('cabeçalho e colunas', async () => {
  check('mostra quantos orçamentos há', total0 > 0, `${total0} arquivados`);
  const texto = await lista.innerText();
  for (const coluna of ['Cliente', 'Data', 'Conteúdo', 'Atendente', 'Total']) check(`coluna ${coluna}`, texto.includes(coluna));
  await shot(page, `${theme}-1366-orcamentos`);
});

await step('linha de orçamento', async () => {
  const linha = page.locator('tr, article, li').filter({ hasText: 'Maria Souza' }).first();
  const texto = await linha.innerText();
  check('mostra cliente e telefone', texto.includes('Maria Souza') && texto.includes('19987654321'));
  check('mostra data e hora', /\d{2}\/\d{2}\/\d{4}/.test(texto));
  check('mostra o atendente', texto.includes('admin.e2e@cognivault.local'));
  check('mostra o total com separador brasileiro', /R\$\s?\d/.test(texto), (texto.match(/R\$\s?[\d.,]+/) ?? [''])[0]);
  check('mostra o desconto aplicado', /5%/.test(texto), (texto.match(/com [^\n]*/) ?? [''])[0]);
});

await step('filtro de texto', async () => {
  const campo = page.getByPlaceholder(/Ex\.: Sr\. Carlos/);
  await campo.fill('Maria');
  await campo.press('Enter');
  await pronto();
  const so = await page.locator('main').innerText();
  check('filtrar por nome mostra só esse cliente', so.includes('Maria Souza') && !so.includes('João Pereira'));
  await campo.fill('506744201');
  await campo.press('Enter');
  await pronto();
  check('filtrar por código de peça acha o orçamento', (await page.locator('main').innerText()).includes('João Pereira'));
  await campo.fill('zzzqqq');
  await campo.press('Enter');
  await pronto();
  const vazio = await page.locator('main').innerText();
  check('filtro sem resultado diz que não achou', /nenhum|não há|sem resultado/i.test(vazio), vazio.replace(/\s+/g, ' ').slice(0, 120));
  await page.getByRole('button', { name: 'Limpar' }).click();
  await pronto();
  check('"Limpar" volta à lista completa', (await contagem()) === total0);
});

await step('filtro de datas', async () => {
  const [de, ate] = [page.locator('input[type=date]').nth(0), page.locator('input[type=date]').nth(1)];
  await de.fill('2020-01-01');
  await ate.fill('2020-12-31');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await pronto();
  check('período antigo não traz orçamentos de hoje', !(await page.locator('main').innerText()).includes('Maria Souza'));
  const hoje = new Date().toISOString().slice(0, 10);
  await de.fill(hoje);
  await ate.fill(hoje);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await pronto();
  console.log('   tela com filtro de hoje:', (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 260));
  check('"até hoje" inclui o orçamento criado hoje (dia da loja, não do servidor)', (await page.locator('main').innerText()).includes('Maria Souza'));
  await page.getByRole('button', { name: 'Limpar' }).click();
  await pronto();
});

await step('abrir os itens e copiar código', async () => {
  const linha = page.locator('tr, article, li').filter({ hasText: 'Maria Souza' }).first();
  const abrir = linha.getByRole('button').filter({ hasText: /PEÇA|CARBURADOR|\w{3}/ }).first();
  await abrir.click();
  await page.waitForTimeout(600);
  const copiar = page.getByRole('button', { name: /^Copiar o código/ }).first();
  check('itens abertos mostram o botão de copiar código', (await copiar.count()) >= 1);
  await copiar.click();
  check('copiar põe o código puro', /^[A-Z0-9]{6,}$/.test(await page.evaluate(() => navigator.clipboard.readText())));
  await shot(page, `${theme}-1366-orcamentos-itens`);
});

await step('retomar', async () => {
  const linha = page.locator('tr, article, li').filter({ hasText: 'Maria Souza' }).first();
  await linha.getByRole('button', { name: 'Retomar' }).click();
  await confirmar(page, 'Retomar');
  await page.waitForTimeout(2000);
  const gaveta = page.getByRole('dialog').first();
  check('retomar abre a gaveta do orçamento com a cesta restaurada', (await gaveta.getByPlaceholder('Nome do cliente').inputValue()) === 'Maria Souza' && /2 itens|1 item/.test(await gaveta.innerText()));
  const cesta = await page.evaluate(() => fetch('/api/quotes/draft', { credentials: 'include' }).then(r => r.json()));
  const itens = cesta?.quote?.items ?? cesta?.items ?? [];
  check('a cesta passa a ter os itens do orçamento retomado', itens.some(i => i.partNumber?.includes('505306701')), `${itens.length} itens`);
  check('cliente e pagamento voltam junto', JSON.stringify(cesta).includes('Maria Souza') && JSON.stringify(cesta).includes('Débito'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
});

await step('excluir', async () => {
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).click();
  await page.getByText(/orçamentos? arquivados?/).waitFor();
  await pronto();
  const antes = await contagem();
  console.log('   linhas com João Pereira:', await page.locator('main').getByText('João Pereira').count(), '| botões Excluir:', await page.getByRole('button', { name: 'Excluir orçamento' }).count());
  const linha = page.locator('main').getByText('João Pereira').first().locator('xpath=ancestor::*[.//button[@aria-label="Excluir orçamento"]][1]');
  await linha.getByRole('button', { name: 'Excluir orçamento' }).click();
  check('excluir pergunta antes, avisando que não dá para desfazer', (await page.getByRole('alertdialog').innerText()).includes('desfazer'));
  await confirmar(page, 'Excluir');
  await pronto();
  check('excluir tira o orçamento da lista', (await contagem()) === antes - 1, `${antes} → ${await contagem()}`);
});

await step('paginação', async () => {
  const ant = page.getByRole('button', { name: 'Anteriores' });
  const prox = page.getByRole('button', { name: 'Próximos' });
  if (await ant.count()) check('na primeira página "Anteriores" está desabilitado', await ant.isDisabled());
  else console.log('   sem paginação (poucos orçamentos)');
  void prox;
});

// Limpa os orçamentos que este roteiro criou (só na loja simulada), para não acumular de rodada em rodada.
await page.evaluate(async () => {
  for (const nome of ['Maria Souza', 'João Pereira']) {
    const lista = await fetch(`/api/quotes?q=${encodeURIComponent(nome)}&take=100`, { credentials: 'include' }).then(r => r.json());
    for (const q of lista.quotes ?? []) await fetch(`/api/quotes/${q.id}`, { method: 'DELETE', credentials: 'include' });
  }
});

await finish(browser, errors);
