// TROCA DE CÓDIGO no Atendimento: o atendente digita um código antigo e vê, sozinho, o código que a Husqvarna aceita hoje
// (o ÚLTIMO da cadeia do Portal), com o que ele digitou à vista. Usa o Portal público de verdade (a simulação alcança).
// Códigos reais medidos em 2026-10-07: 506027201 → … → 587329503 (7 trocas), 586931401 → 587106701, 587106701 é o atual.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/troca-codigo-completo.mjs [tema]
import { open, check, step, finish, shot, clearQuote, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'dark' });
const faixa = () => page.getByRole('alert', { name: 'Código substituído' });
const chamadas = [];
page.on('request', r => { if (/\/api\/parts\/[^/]+\/live-data/.test(r.url())) chamadas.push(r.url().match(/parts\/([^/]+)\//)[1]); });

async function buscar(texto) {
  const campo = page.getByPlaceholder(SEARCH);
  await campo.fill(texto);
  await campo.press('Enter');
}

await step('código antigo com várias trocas', async () => {
  await buscar('506027201');
  await faixa().waitFor({ timeout: 30000 });
  const texto = (await faixa().innerText()).replace(/\s+/g, ' ');
  check('mostra o que foi digitado', texto.includes('506027201'), texto.slice(0, 80));
  check('o código a pedir é o ÚLTIMO da cadeia (587329503), não o próximo passo (506027207)', /Peça este:\s*587329503/.test(texto), texto);
  check('mostra por onde a peça passou, sem repetir o código novo', /Passou por 506027207/.test(texto) && !/Passou por.*587329503/.test(texto));
  await shot(page, `${theme}-1366-troca-codigo`);

  await faixa().getByRole('button', { name: 'Copiar código novo' }).click();
  check('copiar leva o código novo', (await page.evaluate(() => navigator.clipboard.readText())) === '587329503');
  check('o botão avisa que copiou', await faixa().getByRole('button', { name: 'Copiado' }).isVisible());
});

await step('preço e orçamento direto no código novo', async () => {
  // 586931401 → 587106701 (carburador), que a loja tem no cadastro de preços.
  await buscar('586931401');
  await faixa().waitFor({ timeout: 30000 });
  await faixa().getByText(/R\$\s?[\d.]+,\d{2}/).first().waitFor({ timeout: 15000 });
  check('a faixa mostra o preço do código novo (a loja tem a peça)', true);
  check('não existe "buscar o código novo": é a mesma peça', (await page.getByRole('button', { name: /Buscar o código/ }).count()) === 0);
  await faixa().getByRole('button', { name: '+ Orçamento' }).click();
  check('o botão passa a dizer "No orçamento"', await faixa().getByRole('button', { name: 'No orçamento' }).isVisible());
  await page.waitForTimeout(1800);
  const rascunho = await page.evaluate(async () => (await (await fetch('/api/quotes/draft', { credentials: 'include' })).json()));
  const itens = rascunho?.quote?.items ?? rascunho?.items ?? [];
  const item = itens.find(i => String(i.partNumber).replace(/\D/g, '') === '587106701');
  check('o orçamento recebeu o código NOVO, com o antigo como "era"', !!item && item.isSuperseded === true && String(item.originalCode).replace(/\D/g, '') === '586931401', JSON.stringify(item ? { partNumber: item.partNumber, originalCode: item.originalCode, isSuperseded: item.isSuperseded } : null));
  await clearQuote(page);
});

await step('troca de um passo só', async () => {
  await buscar('586931401');
  await faixa().waitFor({ timeout: 30000 });
  const texto = (await faixa().innerText()).replace(/\s+/g, ' ');
  check('586931401 → 587106701, sem caminho (foi direto)', /Peça este:\s*587106701/.test(texto) && !/Passou por/.test(texto), texto);
});

await step('onde NÃO aparece', async () => {
  await buscar('587106701');
  await page.waitForTimeout(4500);
  check('código atual: sem faixa', (await faixa().count()) === 0);
  await buscar('carburador 506027201');
  await page.waitForTimeout(4500);
  check('frase com código no meio: sem faixa (o código ali é contexto)', (await faixa().count()) === 0);
  await buscar('vela de ignição');
  await page.waitForTimeout(3000);
  check('descrição pura: sem faixa', (await faixa().count()) === 0);
});

await step('consulta única por código', async () => {
  chamadas.length = 0;
  // 532196495 → 532199606 (um passo); ainda não foi buscado nesta sessão.
  await buscar('532196495');
  await faixa().waitFor({ timeout: 30000 });
  await buscar('vela de ignição');
  await page.waitForTimeout(1500);
  await buscar('532196495');
  await faixa().waitFor({ timeout: 10000 });
  await page.waitForTimeout(1000);
  const quantas = chamadas.filter(c => c === '532196495').length;
  check('o mesmo código buscado de novo não consulta o Portal outra vez (cache da tela)', quantas === 1, `${quantas} consulta(s)`);
});

await step('Portal fora do ar', async () => {
  await page.route('**/api/parts/*/live-data', r => r.abort());
  await buscar('503693701');
  await page.waitForTimeout(5000);
  const texto = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  check('sem resposta do Portal: nenhuma faixa e nenhum aviso de erro de integração', (await faixa().count()) === 0 && !/Portal indispon|não foi possível consultar|failed to fetch/i.test(texto));
  check('a busca continua utilizável', await page.getByPlaceholder(SEARCH).isEnabled());
  await page.unroute('**/api/parts/*/live-data');
  // O aborto acima é proposital: o erro de rede que ele gera no console não é defeito do site.
  for (let i = errors.length - 1; i >= 0; i -= 1) if (/ERR_FAILED/.test(errors[i])) errors.splice(i, 1);
});

await step('medidas da faixa', async () => {
  await buscar('586931401');
  await faixa().waitFor({ timeout: 30000 });
  const menor = await faixa().evaluate(el => Math.min(...[...el.querySelectorAll('*')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize))));
  check('nenhum texto da faixa abaixo de 14 px', menor >= 14, `${menor}px`);
  const botoes = await faixa().getByRole('button').evaluateAll(l => l.map(b => b.getBoundingClientRect().height));
  check('botões com pelo menos 32 px de altura', botoes.every(h => h >= 32), botoes.join(', '));
  check('sem rolagem horizontal', !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)));
});

await finish(browser, errors);
