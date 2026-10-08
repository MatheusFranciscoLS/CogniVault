// Mede, na LOJA SIMULADA, quanto cada parte da busca leva: cadastro de preços e busca técnica (stream).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/tempo.mjs "pergunta 1" "pergunta 2"
import { createRequire } from 'node:module';
// O Playwright é procurado a partir da pasta ONDE O COMANDO RODA (frontend/), não ao lado deste arquivo.
const { chromium } = createRequire(process.cwd() + '/package.json')('@playwright/test');

const queries = process.argv.slice(2);
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto('http://127.0.0.1:5173/login');
await page.getByLabel('E-mail').fill('admin.e2e@cognivault.local');
await page.locator('#login-password').fill('CogniVault-E2E-2026!');
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForURL(/\/atendimento/);

for (const q of queries) {
  const r = await page.evaluate(async q => {
    const t = async url => {
      const t0 = performance.now();
      const x = await fetch(url, { credentials: 'include' });
      const text = await x.text();
      return { ms: Math.round(performance.now() - t0), status: x.status, bytes: text.length, cache: x.headers.get('X-CogniVault-Cache') };
    };
    // 2 vezes: a 2ª mostra o custo SEM o cache de 2 min do servidor ser o que importa na 1ª.
    const comercial1 = await t('/api/master-parts/search?q=' + encodeURIComponent(q));
    const comercial2 = await t('/api/master-parts/search?q=' + encodeURIComponent(q));
    // A busca técnica chega em fases (lexical primeiro). O atendente vê a 1ª fase, não o fim do fluxo.
    const tecnica = await (async () => {
      const t0 = performance.now();
      const x = await fetch('/api/search/stream?q=' + encodeURIComponent(q) + '&typed=' + encodeURIComponent(q), { credentials: 'include' });
      const reader = x.body.getReader();
      const fases = [];
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const eventos = buf.split('\n\n'); buf = eventos.pop() ?? '';
        for (const e of eventos) { const l = e.split('\n').find(z => z.startsWith('data: ')); if (l) { try { fases.push(JSON.parse(l.slice(6)).type + '@' + Math.round(performance.now() - t0) + 'ms'); } catch { /* ignora */ } } }
      }
      return { ms: Math.round(performance.now() - t0), fases: fases.join(' ') };
    })();
    const oficial = await t('/api/official-fallback?q=' + encodeURIComponent(q));
    return { comercial1, comercial2, tecnica, oficial };
  }, q);
  console.log(JSON.stringify(q));
  console.log(`   comercial 1ª: ${r.comercial1.ms}ms (${r.comercial1.cache})   2ª: ${r.comercial2.ms}ms (${r.comercial2.cache})   oficial: ${r.oficial.ms}ms`);
  console.log(`   técnica (stream, total ${r.tecnica.ms}ms): ${r.tecnica.fases}`);
}
await browser.close();
