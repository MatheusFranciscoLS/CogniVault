// Atualizar a lista de preços pela tela do administrador (Negócio): escolher o .html, ver o relatório, gravar, e os casos de erro.
// Usa um arquivo INVENTADO (gerado aqui, fora do repositório) a partir de peças da loja SIMULADA; nenhum dado real. Restaura a loja simulada no fim.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/lista-precos-atualizar.mjs [tema]
import fs from 'node:fs';
import path from 'node:path';
import { open, check, step, finish, shot, sqlSim, confirmar, OUT } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });

// ── Monta o arquivo inventado ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const linhas = sqlSim(`SELECT "normalizedNumber", "partNumber", COALESCE("price",0) FROM "MasterPart" WHERE "price" > 5 AND "normalizedNumber" ~ '^[0-9]{9}$' ORDER BY "normalizedNumber" LIMIT 90`)
  .trim().split('\n').map(linha => linha.split('|'));
if (linhas.length < 20) throw new Error('a loja simulada não tem peças suficientes para o roteiro');
const original = new Map(linhas.map(([normalizado, , preco]) => [normalizado, Number(preco)]));
const consumidor = valor => `R$ ${valor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

const mudam = linhas.slice(0, 6);        // +10%
const iguais = [...linhas.slice(6, 12), ...linhas.slice(13, 90)];      // mesmo preço (preço da loja × 0,92 volta ao mesmo valor)
const conflito = linhas[12];             // mesmo código com dois preços: tem que ser RECUSADO
const pecas = [
  ...mudam.map(([, codigo, preco]) => ({ codigo, descricao: `PEÇA TESTE ${codigo}`, preco: consumidor(Number(preco) * 1.1 * 0.92), modelo: 'MODELO TESTE' })),
  ...iguais.map(([, codigo, preco]) => ({ codigo, descricao: `PEÇA TESTE ${codigo}`, preco: consumidor(Number(preco) * 0.92), modelo: 'MODELO TESTE' })),
  { codigo: conflito[1], descricao: 'CONFLITO A', preco: 'R$ 10,00', modelo: 'M1' },
  { codigo: conflito[1], descricao: 'CONFLITO B', preco: 'R$ 99,00', modelo: 'M2' },
  { codigo: 'ZZTESTE001', descricao: 'PEÇA NOVA UM', preco: 'R$ 46,00', modelo: 'MODELO NOVO' },
  { codigo: 'ZZTESTE002', descricao: 'PEÇA NOVA DOIS', preco: 'R$ 92,00', modelo: 'MODELO NOVO' },
  { codigo: '', descricao: 'LINHA SEM CÓDIGO', preco: 'R$ 1,00' },
  { codigo: 'ZZTESTE003', descricao: 'PREÇO RUIM', preco: '12,5' },
];
const pasta = path.join(OUT, 'lista-teste');
fs.mkdirSync(pasta, { recursive: true });
const imagem = 'data:image/png;base64,' + 'A'.repeat(200_000); // enfeite: o arquivo real é quase todo imagem
const arquivo = path.join(pasta, 'lista-inventada.html');
fs.writeFileSync(arquivo, `<!DOCTYPE html><html><body><script id="catalogData" type="application/json">${JSON.stringify({ produtos: [{ codigo: 'MAQ', imagem }], pecas, acessorios: [], lubrificantes: [], ferramentas: [] })}</script></body></html>`);
const naoLista = path.join(pasta, 'outra-coisa.html');
fs.writeFileSync(naoLista, '<html><body><h1>não é a lista</h1></body></html>');
// Arquivo ESTRAGADO: 40% das linhas com preço fora do padrão (formato mudou?). Não pode gravar.
const estragada = path.join(pasta, 'estragada.html');
fs.writeFileSync(estragada, `<script id="catalogData" type="application/json">${JSON.stringify({ pecas: [
  ...Array.from({ length: 6 }, (_, i) => ({ codigo: `ZZBOM00${i}`, descricao: 'BOA', preco: 'R$ 10,00', modelo: 'M' })),
  ...Array.from({ length: 2 }, (_, i) => ({ codigo: `ZZRUIM0${i}`, descricao: 'RUIM', preco: 'R$ 0,00', modelo: 'M' })),
  ...Array.from({ length: 2 }, (_, i) => ({ codigo: `ZZRUIM1${i}`, descricao: 'RUIM', preco: 'dez reais', modelo: 'M' })),
], acessorios: [], lubrificantes: [], ferramentas: [] })}</script>`);
const incompleta = path.join(pasta, 'incompleta.html');
fs.writeFileSync(incompleta, `<script id="catalogData" type="application/json">${JSON.stringify({ pecas: [] })}</script>`);

const restaurar = () => {
  sqlSim(`DELETE FROM "MasterPartSection" WHERE "normalizedNumber" LIKE 'ZZTESTE%'`);
  sqlSim(`DELETE FROM "MasterPart" WHERE "normalizedNumber" LIKE 'ZZTESTE%'`);
  for (const [normalizado, preco] of original) sqlSim(`UPDATE "MasterPart" SET "price" = ${preco} WHERE "normalizedNumber" = '${normalizado}'`);
  sqlSim(`DELETE FROM "CommercialImportRun" WHERE "sourceFilename" = 'lista-inventada.html'`);
};
const precoNoBanco = normalizado => Number(sqlSim(`SELECT "price" FROM "MasterPart" WHERE "normalizedNumber" = '${normalizado}'`).trim());
const total = () => Number(sqlSim(`SELECT COUNT(*) FROM "MasterPart"`).trim());


// Contraste medido no DOM renderizado (cor do texto contra o primeiro fundo opaco acima dele), como pede o cognivault-ui.
const contraste = cartao => cartao.evaluate(raiz => {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const lum = ({ r, g, b }) => { const v = [r, g, b].map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const fundo = el => { for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0.99) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const piores = [];
  for (const el of raiz.querySelectorAll('*')) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el); const fg = parse(cs.color); if (!fg) continue;
    const bg = fundo(el); const a = fg.a; const mix = { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
    const l1 = lum(mix), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const grande = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (grande ? 3 : 4.5)) piores.push(`${el.textContent.trim().slice(0, 30)} ${ratio.toFixed(2)}`);
  }
  return piores;
});

try {
  restaurar();
  const totalAntes = total();
  await page.goto('http://127.0.0.1:5173/administracao/negocio');
  const cartao = page.getByRole('region', { name: 'Atualizar a lista de preços' });
  await cartao.waitFor({ timeout: 30000 });
  await cartao.scrollIntoViewIfNeeded();
  const entrada = cartao.locator('#price-list-file');

  await step('Arquivo estragado (muita linha ilegível) mostra o motivo e NÃO deixa gravar', async () => {
    await entrada.setInputFiles(estragada);
    await cartao.getByRole('button', { name: 'Gravar na loja' }).waitFor({ timeout: 60000 });
    check('o alerta explica: mais de 5% das linhas não puderam ser lidas', /Mais de 5% das linhas não puderam ser lidas \(4 de 10/.test(await cartao.innerText()), (await cartao.innerText()).replace(/\s+/g, ' ').slice(0, 260));
    check('o botão de gravar está desabilitado', await cartao.getByRole('button', { name: 'Gravar na loja' }).isDisabled());
    check('R$ 0,00 e texto contam como preço fora do padrão', /4 com preço fora do padrão/.test(await cartao.innerText()));
    await shot(page, `${theme}-1366-lista-estragada`);
    check('nada foi gravado', total() === totalAntes);
    await cartao.getByRole('button', { name: 'Escolher outro arquivo' }).click();
  });

  await step('Arquivo errado explica o que houve e deixa escolher outro', async () => {
    for (const [arq, texto] of [[naoLista, /não parece ser o arquivo/], [incompleta, /"acessorios" não está|não está no arquivo/]]) {
      await entrada.setInputFiles(arq);
      const alerta = cartao.getByRole('alert');
      await alerta.waitFor({ timeout: 15000 });
      check(`recusa ${path.basename(arq)} com mensagem clara`, texto.test(await alerta.innerText()), (await alerta.innerText()).slice(0, 100));
      check('o botão de escolher continua disponível', (await cartao.getByRole('button', { name: 'Escolher o arquivo' }).count()) === 1);
    }
    check('nada foi gravado', total() === totalAntes);
  });

  await step('O relatório mostra o que muda, o que é novo, o recusado, e NÃO grava nada', async () => {
    await entrada.setInputFiles(arquivo);
    await cartao.getByRole('button', { name: 'Gravar na loja' }).waitFor({ timeout: 60000 });
    const texto = (await cartao.innerText()).replace(/\s+/g, ' ');
    check('preços que mudam = 6', /6\s*Preços que mudam/.test(texto), texto.slice(0, 200));
    check('códigos novos = 2', /2\s*Códigos novos/.test(texto));
    check('o código com dois preços aparece como recusado', /1 código recusado/.test(texto));
    check('as linhas ruins são contadas como ignoradas', /1 sem código e 1 com preço fora do padrão/.test(texto));
    check('os maiores aumentos aparecem', (await cartao.getByRole('heading', { name: 'Maiores aumentos' }).count()) === 1);
    check('a base não foi tocada pelo relatório', total() === totalAntes && precoNoBanco(mudam[0][0]) === original.get(mudam[0][0]));
    const baixos = await contraste(cartao);
    check('contraste AA em todo o texto do relatório', baixos.length === 0, baixos.slice(0, 3).join(' | '));
    await shot(page, `${theme}-1366-lista-precos-relatorio`);
  });

  await step('Cancelar a confirmação não grava', async () => {
    await cartao.getByRole('button', { name: 'Gravar na loja' }).click();
    const dialogo = page.getByRole('alertdialog');
    await dialogo.waitFor();
    check('a confirmação mostra os números aprovados', /6 preços serão atualizados e 2 códigos novos/.test(await dialogo.innerText()), (await dialogo.innerText()).slice(0, 120));
    await shot(page, `${theme}-1366-lista-precos-confirmar`);
    await dialogo.getByRole('button', { name: /Cancelar|Voltar/ }).click();
    await page.waitForTimeout(500);
    check('nada foi gravado', total() === totalAntes && precoNoBanco(mudam[0][0]) === original.get(mudam[0][0]));
  });

  await step('Gravar aplica exatamente o aprovado e confere o banco', async () => {
    await cartao.getByRole('button', { name: 'Gravar na loja' }).click();
    await confirmar(page, 'Gravar');
    await cartao.getByText(/Pronto:/).waitFor({ timeout: 60000 });
    check('mensagem de sucesso com os números', /6 preços atualizados e 2 códigos novos/.test(await cartao.innerText()));
    const [normalizado, , preco] = mudam[0];
    check('o preço mudou no banco (+10%)', Math.abs(precoNoBanco(normalizado) - Number(preco) * 1.1) < 0.02, `${precoNoBanco(normalizado)} vs ${Number(preco) * 1.1}`);
    check('os códigos novos entraram com o preço ÷ 0,92', Math.abs(precoNoBanco('ZZTESTE001') - 50) < 0.02 && Math.abs(precoNoBanco('ZZTESTE002') - 100) < 0.02);
    check('o código recusado não mudou', precoNoBanco(conflito[0]) === original.get(conflito[0]));
    check('nenhuma peça foi apagada (só 2 a mais)', total() === totalAntes + 2);
    check('a importação ficou registrada', sqlSim(`SELECT COUNT(*) FROM "CommercialImportRun" WHERE "sourceFilename" = 'lista-inventada.html'`).trim() === '1');
    const baixosPronto = await contraste(cartao);
    check('contraste AA na mensagem de sucesso', baixosPronto.length === 0, baixosPronto.slice(0, 3).join(' | '));
    await shot(page, `${theme}-1366-lista-precos-pronto`);
  });

  await step('O mesmo arquivo de novo não tem mais o que gravar', async () => {
    await cartao.getByRole('button', { name: 'Escolher o arquivo' }).waitFor();
    await entrada.setInputFiles(arquivo);
    await cartao.getByText(/A loja já está igual a esta lista/).waitFor({ timeout: 60000 });
    check('o botão de gravar fica desabilitado', await cartao.getByRole('button', { name: 'Gravar na loja' }).isDisabled());
  });

  await step('A rota recusa quem não está logado e corpo ou números inválidos, sem erro 500', async () => {
    const base = 'http://127.0.0.1:5173/api/admin/price-list';
    const semLogin = await fetch(base + '/preview', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/octet-stream' }, body: 'x' });
    check('sem login: 401', semLogin.status === 401, String(semLogin.status));
    const cab = { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/octet-stream' };
    const lixo = await page.request.post(base + '/preview', { data: 'isto nao e gzip', headers: cab });
    check('corpo que não é gzip: 400', lixo.status() === 400, String(lixo.status()));
    const semNumeros = await page.request.post(base + '/apply', { data: 'x', headers: cab });
    check('gravar sem os números aprovados: 400', semNumeros.status() === 400, String(semNumeros.status()));
    const hashRuim = await page.request.post(base + '/apply?changed=0&added=0&hash=' + 'a'.repeat(64), { data: 'x', headers: cab });
    check('gravar com corpo inválido: 400, nunca 500', hashRuim.status() === 400, String(hashRuim.status()));
  });
} finally {
  restaurar();
}

await finish(browser, errors);
