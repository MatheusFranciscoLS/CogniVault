// Renderiza as páginas de um PDF em PNG (pdf.js dentro do Playwright), para OLHAR o que o cliente recebe.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/ver-pdf.mjs <arquivo.pdf> [saida-prefixo]
import fs from 'node:fs';
import path from 'node:path';
import { chromium, OUT } from './_t.mjs';

const arquivo = process.argv[2];
const prefixo = process.argv[3] ?? path.join(OUT, path.basename(arquivo, '.pdf'));
const base64 = fs.readFileSync(arquivo).toString('base64');

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1.5 })).newPage();
await page.setContent('<body style="margin:0;background:#888"><div id="paginas"></div></body>');
await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' });
const total = await page.evaluate(async b64 => {
  // eslint-disable-next-line no-undef
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  // eslint-disable-next-line no-undef
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const host = document.getElementById('paginas');
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const viewport = pagina.getViewport({ scale: 1.4 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height; canvas.id = `p${n}`;
    canvas.style.cssText = 'display:block;margin:8px auto;background:#fff';
    host.appendChild(canvas);
    await pagina.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }
  return pdf.numPages;
}, base64);
for (let n = 1; n <= total; n++) {
  await page.locator(`#p${n}`).screenshot({ path: `${prefixo}-p${n}.png` });
  console.log(`${prefixo}-p${n}.png`);
}
await browser.close();
