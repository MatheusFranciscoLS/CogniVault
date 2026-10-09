// Transforma a(s) primeira(s) página(s) de um ou mais PDFs em PNG, para CONFERIR O VISUAL do que o cliente recebe (orçamento de peças, de máquina, de conserto).
// Usa o pdf.js do backend dentro do Chromium do Playwright; nada é enviado para fora da máquina.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/pdf-para-png.mjs <pasta-de-saida> <arquivo.pdf> [outro.pdf ...]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from './_t.mjs';

const [saida, ...pdfs] = process.argv.slice(2);
if (!saida || !pdfs.length) throw new Error('Uso: pdf-para-png.mjs <pasta-de-saida> <arquivo.pdf> [...]');
fs.mkdirSync(saida, { recursive: true });
const pdfjs = path.resolve('../backend/node_modules/pdfjs-dist/build');
// Tudo é lido NA PARTIDA e o servidor só devolve da memória: o endereço pedido nunca vira caminho de arquivo (nada de "/lib/../..").
const arquivos = new Map(pdfs.map((p, i) => [`/pdf/${i}`, { nome: path.basename(p, '.pdf'), bytes: fs.readFileSync(path.resolve(p)) }]));
const bibliotecas = new Map(['pdf.mjs', 'pdf.worker.mjs'].map(nome => [`/lib/${nome}`, fs.readFileSync(path.join(pdfjs, nome))]));

const servidor = http.createServer((req, res) => {
  const url = req.url ?? '';
  if (url === '/') { res.setHeader('content-type', 'text/html'); res.end('<canvas id="c"></canvas>'); return; }
  const biblioteca = bibliotecas.get(url);
  if (biblioteca) { res.setHeader('content-type', 'text/javascript'); res.end(biblioteca); return; }
  const pdf = arquivos.get(url);
  if (pdf) { res.setHeader('content-type', 'application/pdf'); res.end(pdf.bytes); return; }
  res.statusCode = 404; res.end();
}).listen(0, '127.0.0.1');
await new Promise(resolve => servidor.once('listening', resolve));
const porta = servidor.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
await page.goto(`http://127.0.0.1:${porta}/`);
for (const [rota, { nome }] of arquivos) {
  const paginas = await page.evaluate(async ({ rota, porta }) => {
    const pdfjsLib = await import(`http://127.0.0.1:${porta}/lib/pdf.mjs`);
    pdfjsLib.GlobalWorkerOptions.workerSrc = `http://127.0.0.1:${porta}/lib/pdf.worker.mjs`;
    const doc = await pdfjsLib.getDocument(rota).promise;
    const imagens = [];
    for (let n = 1; n <= Math.min(doc.numPages, 3); n++) {
      const pagina = await doc.getPage(n);
      const viewport = pagina.getViewport({ scale: 1.5 });
      const canvas = document.getElementById('c');
      canvas.width = viewport.width; canvas.height = viewport.height;
      await pagina.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      imagens.push(canvas.toDataURL('image/png'));
    }
    return { total: doc.numPages, imagens };
  }, { rota, porta });
  paginas.imagens.forEach((dataUrl, i) => {
    const destino = path.join(saida, `${nome}-p${i + 1}.png`);
    fs.writeFileSync(destino, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`${destino} (${paginas.total} página(s) no PDF)`);
  });
}
await browser.close();
servidor.close();
