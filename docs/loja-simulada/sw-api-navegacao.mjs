// O aplicativo é instalável (PWA). Uma NAVEGAÇÃO do navegador para /api/... (um link que abre em nova aba, como o PDF da Briggs) não pode ser
// respondida pelo service worker com a tela do aplicativo: a aba abria o PDF/JSON e "voltava" para /atendimento (dono, 2026-10-08, só em produção).
// Só aparece com o BUILD de produção (o servidor de desenvolvimento não tem service worker).
// Uso (de dentro de frontend/): npm run build && npx vite preview --host 127.0.0.1 --port 5173 --strictPort &  node ../docs/loja-simulada/sw-api-navegacao.mjs
import { chromium, check, finish } from './_t.mjs';

const BASE = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'allow' });
const page = await context.newPage();

const entrada = await page.request.post(BASE + '/api/login', { data: { email: 'admin.e2e@cognivault.local', password: 'CogniVault-E2E-2026!' }, headers: { Origin: BASE } });
check('login por API', entrada.ok(), String(entrada.status()));

// Primeira visita instala o service worker; espera ele controlar a página (é o estado de quem usa o app todo dia).
await page.goto(BASE + '/login');
await page.evaluate(async () => { await navigator.serviceWorker.ready; });
await page.reload();
await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20000 });
check('o service worker está controlando a página (como no balcão)', true);

// 1) Navegação para a rota que abre o PDF da Briggs.
const resposta = await page.goto(BASE + '/api/briggs/parts-manuals/open?model=12J902-0118-01', { waitUntil: 'commit' }).catch(error => ({ erro: String(error.message).split('\n')[0] }));
await page.waitForTimeout(2500);
const url = page.url();
const tipo = resposta && 'headers' in resposta ? (await resposta.allHeaders())['content-type'] : String(resposta?.erro ?? '');
console.log('   URL final:', url.slice(0, 90), '| tipo:', tipo);
// O navegador de teste recebe o PDF como DOWNLOAD ("Download is starting"): é o resultado certo. Ruim seria terminar numa rota do app ou em HTML.
const entregouArquivo = /Download is starting/.test(tipo) || /application\/pdf/.test(tipo);
check('a navegação para /api/briggs/.../open entrega o PDF e NÃO vira a tela do aplicativo', entregouArquivo || (!/\/(atendimento|login|dashboard)(\?|$)/.test(new URL(url, BASE).pathname) && !/text\/html/.test(tipo)), `${new URL(url, BASE).pathname} ${tipo}`);

// 2) Qualquer GET de API aberto como navegação devolve a resposta da API, não o HTML do app.
const json = await page.goto(BASE + '/api/me', { waitUntil: 'load' });
const corpo = (await json.text()).slice(0, 120);
check('navegar para /api/me mostra a resposta da API (JSON), não o HTML do aplicativo', /^\s*\{/.test(corpo) && !/<!doctype html/i.test(corpo), corpo.replace(/\s+/g, ' '));

// 3) A tela do aplicativo continua funcionando offline-first: uma rota do app (não /api) ainda recebe o shell.
const rota = await page.goto(BASE + '/tabela-de-precos', { waitUntil: 'load' });
check('uma rota do app (fora de /api) continua servida pelo service worker', rota.status() === 200 && /<div id="root"/.test(await rota.text()));

await finish(browser, []);
