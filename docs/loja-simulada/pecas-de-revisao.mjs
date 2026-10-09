// PEÇAS DE REVISÃO por máquina (pedido do dono, 2026-10-09): o campo "reparo" da lista de preços (preventivo, consumível, preditivo) vira um painel na máquina,
// com preço e prateleira da loja e "Adicionar revisão ao orçamento". A tabela é carregada pela MESMA tela de atualização da lista (Negócio).
// Usa um arquivo INVENTADO (gerado aqui, fora do repositório); restaura a loja simulada no fim.
// Precisa de internet (Portal Husqvarna) para abrir a máquina. Uso (de dentro de frontend/): node ../docs/loja-simulada/pecas-de-revisao.mjs [tema]
import fs from 'node:fs';
import path from 'node:path';
import { open, check, step, finish, shot, sqlSim, confirmar, SEARCH, OUT } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });

const PNC_SOPRADOR = '970466903'; // 345BT: o kit do catálogo interno NÃO cobre
const PNC_COM_KIT = '960410052'; // LTH1842: o kit do catálogo interno cobre
const consumidor = valor => `R$ ${valor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

// Duas peças que a loja já tem com preço: a linha do painel precisa mostrar o preço da loja.
const existentes = sqlSim(`SELECT "normalizedNumber", "partNumber", "price" FROM "MasterPart" WHERE "price" > 5 AND "normalizedNumber" ~ '^[0-9]{9}$' ORDER BY "normalizedNumber" LIMIT 2`)
  .trim().split('\n').map(linha => linha.split('|'));
const linhaPreco = ([, codigo, preco]) => ({ codigo, preco: consumidor(Number(preco) * 0.92), modelo: 'MODELO TESTE' });
const reparo = (codigo, pnc, tipo, descricao) => ({ codigo, pnc, reparo: tipo, descricao, preco: 'R$ 46,00', modelo: 'MODELO TESTE' });

const pecas = [
  { ...linhaPreco(existentes[0]), pnc: PNC_SOPRADOR, reparo: 'PREVENTIVO', descricao: 'PEÇA EXISTENTE A' },
  { ...linhaPreco(existentes[1]), pnc: PNC_SOPRADOR, reparo: 'CONSUMÍVEL', descricao: 'PEÇA EXISTENTE B' },
  reparo('ZZREV001', PNC_SOPRADOR, 'PREVENTIVO', 'FILTRO DE AR TESTE'),
  reparo('ZZREV002', PNC_SOPRADOR, 'PREVENTIVO', 'ABRAÇADEIRA TESTE'),
  reparo('ZZREV003', PNC_SOPRADOR, 'PREDITIVO', 'ROLAMENTO TESTE'),
  reparo('ZZREV004', PNC_SOPRADOR, 'CORRETIVO', 'PEÇA DE CONSERTO (NÃO É REVISÃO)'),
  reparo('ZZREV005', PNC_SOPRADOR, '', 'PEÇA SEM TIPO'),
  reparo('ZZREV006', PNC_COM_KIT, 'PREVENTIVO', 'PEÇA DA MÁQUINA COM KIT'),
];
const pasta = path.join(OUT, 'lista-teste');
fs.mkdirSync(pasta, { recursive: true });
const html = lista => `<!DOCTYPE html><html><body><script id="catalogData" type="application/json">${JSON.stringify({ produtos: [], pecas: lista, acessorios: [], lubrificantes: [], ferramentas: [] })}</script></body></html>`;
const arquivo1 = path.join(pasta, 'lista-revisao.html');
fs.writeFileSync(arquivo1, html(pecas));
// 2ª lista: nada de preço muda e nenhum código é novo; só a revisão do soprador muda (sai o rolamento, o filtro vira consumível).
const arquivo2 = path.join(pasta, 'lista-revisao.html');
const pecas2 = pecas.filter(p => p.codigo !== 'ZZREV003').map(p => (p.codigo === 'ZZREV001' ? { ...p, reparo: 'CONSUMÍVEL' } : p));
const arquivoAntiga = path.join(pasta, 'lista-sem-reparo.html');
fs.writeFileSync(arquivoAntiga, html(pecas2.map(({ reparo: _r, pnc: _p, ...resto }) => resto)));

const restaurar = () => {
  sqlSim(`DELETE FROM "MachineServicePart"`);
  sqlSim(`DELETE FROM "MasterPartSection" WHERE "normalizedNumber" LIKE 'ZZREV%'`);
  sqlSim(`DELETE FROM "MasterPart" WHERE "normalizedNumber" LIKE 'ZZREV%'`);
  sqlSim(`DELETE FROM "CommercialImportRun" WHERE "sourceFilename" IN ('lista-revisao.html', 'lista-sem-reparo.html')`);
};
const quantas = () => Number(sqlSim(`SELECT COUNT(*) FROM "MachineServicePart"`).trim());
const nomes = pnc => sqlSim(`SELECT "normalizedNumber" || ':' || "kind" FROM "MachineServicePart" WHERE "pnc" = '${pnc}' ORDER BY 1`).trim().split(/\r?\n/).filter(Boolean);

async function escolher(arquivo) {
  const cartao = page.getByRole('region', { name: 'Atualizar a lista de preços' });
  await cartao.locator('#price-list-file').setInputFiles(arquivo);
  return cartao;
}

async function abrirMaquinaPorPnc(pnc) {
  if (await page.getByRole('dialog').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  await page.goto(`http://127.0.0.1:5173/dashboard?tab=machines&pnc=${pnc}`);
  // Neste endereço a máquina abre na própria página (sem diálogo). Esperar a vista explodida garante que a máquina carregou antes dos testes de ausência.
  await page.getByRole('region', { name: 'Vistas explodidas da máquina' }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000);
  return page;
}

async function abrirMaquina(busca) {
  if (await page.getByRole('dialog').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  await page.goto('http://127.0.0.1:5173/atendimento');
  await page.getByPlaceholder(SEARCH).fill(busca);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const fichas = page.locator('button:has(.font-code)', { hasText: 'PNC' });
  await fichas.first().waitFor({ timeout: 40000 });
  await fichas.first().click();
  const painel = page.getByRole('dialog').first();
  await painel.getByRole('region', { name: 'Vistas explodidas da máquina' }).waitFor({ timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return painel;
}

try {
  restaurar();

  await step('Antes de carregar a lista com o campo, a máquina não mostra revisão (e nada quebra)', async () => {
    const painel = await abrirMaquinaPorPnc(PNC_SOPRADOR);
    check('sem tabela carregada: nenhum painel de revisão', (await painel.getByRole('region', { name: 'Peças de revisão' }).count()) === 0);
  });

  await step('Lista sem o campo "reparo" não apaga nem inventa revisão', async () => {
    await page.goto('http://127.0.0.1:5173/administracao/negocio');
    const cartao = await escolher(arquivoAntiga);
    await cartao.getByRole('button', { name: 'Gravar na loja' }).waitFor({ timeout: 60000 });
    const texto = (await cartao.innerText()).replace(/\s+/g, ' ');
    check('o relatório não fala de revisão (a lista não traz o campo)', !/Peças de revisão:/.test(texto), texto.slice(0, 160));
    await cartao.getByRole('button', { name: 'Escolher outro arquivo' }).click();
  });

  await step('O relatório mostra a revisão; gravar carrega só preventivo, consumível e preditivo', async () => {
    const cartao = await escolher(arquivo1);
    await cartao.getByRole('button', { name: 'Gravar na loja' }).waitFor({ timeout: 60000 });
    const texto = (await cartao.innerText()).replace(/\s+/g, ' ');
    check('mostra 6 peças em 2 máquinas, todas novas', /Peças de revisão: 6 peças em 2 máquinas \(6 novas, 0 saem\)/.test(texto), texto.slice(0, 260));
    check('o relatório não grava nada', quantas() === 0);
    await shot(page, `${theme}-1366-revisao-relatorio`);
    await cartao.getByRole('button', { name: 'Gravar na loja' }).click();
    const dialogo = page.getByRole('alertdialog');
    await dialogo.waitFor();
    check('a confirmação cita a revisão', /peças de revisão será trocada \(6 peças em 2 máquinas\)/.test(await dialogo.innerText()), (await dialogo.innerText()).slice(0, 200));
    await dialogo.getByRole('button', { name: 'Gravar' }).click();
    await cartao.getByText(/Pronto:/).waitFor({ timeout: 60000 });
    check('a mensagem de sucesso fala da revisão', /lista de peças de revisão foi atualizada/.test(await cartao.innerText()));
    check('6 ligações gravadas', quantas() === 6, String(quantas()));
    check('o soprador ficou com 5 (corretivo e sem tipo ficaram de fora)', nomes(PNC_SOPRADOR).length === 5, nomes(PNC_SOPRADOR).join(' '));
    check('o tipo certo de cada uma', nomes(PNC_SOPRADOR).some(n => n.endsWith('ZZREV003:PREDITIVO')) && nomes(PNC_SOPRADOR).some(n => n === 'ZZREV001:PREVENTIVO'), nomes(PNC_SOPRADOR).join(' '));
  });

  await step('Só a revisão mudou: o botão continua habilitado e a tabela é espelhada', async () => {
    await page.goto('http://127.0.0.1:5173/administracao/negocio');
    fs.writeFileSync(arquivo2, html(pecas2));
    const cartao = await escolher(arquivo2);
    await cartao.getByRole('button', { name: 'Gravar na loja' }).waitFor({ timeout: 60000 });
    const texto = (await cartao.innerText()).replace(/\s+/g, ' ');
    check('preços e códigos iguais, só a revisão muda', /0\s*Preços que mudam/.test(texto) && /0\s*Códigos novos/.test(texto) && /\(1 nova, 2 saem\)/.test(texto), texto.slice(0, 300));
    check('o botão de gravar está habilitado', await cartao.getByRole('button', { name: 'Gravar na loja' }).isEnabled());
    await cartao.getByRole('button', { name: 'Gravar na loja' }).click();
    await confirmar(page, 'Gravar');
    await cartao.getByText(/Pronto:/).waitFor({ timeout: 60000 });
    check('o rolamento saiu e o filtro virou consumível', nomes(PNC_SOPRADOR).join(' ').includes('ZZREV001:CONSUMIVEL') && !nomes(PNC_SOPRADOR).join(' ').includes('ZZREV003'), nomes(PNC_SOPRADOR).join(' '));
    // Volta ao estado do 1º arquivo para a parte da tela do balcão.
    fs.writeFileSync(arquivo1, html(pecas));
    const de_novo = await escolher(arquivo1);
    await de_novo.getByRole('button', { name: 'Gravar na loja' }).waitFor({ timeout: 60000 });
    await de_novo.getByRole('button', { name: 'Gravar na loja' }).click();
    await confirmar(page, 'Gravar');
    await de_novo.getByText(/Pronto:/).waitFor({ timeout: 60000 });
    check('de volta às 5 do soprador', nomes(PNC_SOPRADOR).length === 5);
  });

  await step('No balcão: a máquina sem kit no catálogo mostra a revisão, com preço da loja e orçamento de uma vez', async () => {
    const painel = await abrirMaquinaPorPnc(PNC_SOPRADOR);
    const revisao = painel.getByRole('region', { name: 'Peças de revisão' });
    await revisao.waitFor({ timeout: 30000 });
    const linhas = revisao.locator('li');
    check('5 peças, preventivas primeiro', (await linhas.count()) === 5, String(await linhas.count()));
    const primeiro = (await linhas.first().innerText()).replace(/\s+/g, ' ');
    check('a primeira é preventiva', /Preventiva/.test(primeiro), primeiro);
    const textos = (await linhas.allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
    check('as preventivas vêm primeiro, depois o consumível e o preditivo por último', /Preventiva/.test(textos[0] ?? '') && /Preventiva/.test(textos[2] ?? '') && /Consumível/.test(textos[3] ?? '') && /Preditiva/.test(textos[4] ?? ''), textos.join(' | '));
    check('a peça que a loja tem mostra o preço', textos.some(t => /R\$\s?[\d.]+,\d{2}/.test(t)), textos.join(' | '));
    check('o corretivo não aparece', !textos.some(t => /CONSERTO/.test(t)));
    await revisao.scrollIntoViewIfNeeded();
    await shot(page, `${theme}-1366-revisao-maquina`);

    await revisao.getByRole('button', { name: 'Adicionar revisão ao orçamento' }).click();
    await page.waitForTimeout(1500);
    check('o botão confirma', await revisao.getByRole('button', { name: 'Revisão no orçamento' }).isDisabled());
    const rascunho = await page.evaluate(async () => (await (await fetch('/api/quotes/draft', { credentials: 'include' })).json()));
    const itens = rascunho?.quote?.items ?? rascunho?.items ?? [];
    check('as 5 peças estão no orçamento', itens.length === 5, String(itens.length));
    check('com a máquina e o PNC', itens.every(i => String(i.pnc ?? '').includes(PNC_SOPRADOR.slice(0, 9)) || i.model), JSON.stringify(itens[0]).slice(0, 160));
    await page.evaluate(() => fetch('/api/quotes/draft', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [], options: {} }) }));
  });

  await step('Máquina com kit no catálogo interno NÃO duplica: só o kit aparece', async () => {
    const painel = await abrirMaquinaPorPnc(PNC_COM_KIT);
    await painel.getByRole('region', { name: /Kit de manutenção/ }).waitFor({ timeout: 30000 });
    check('sem painel de revisão ao lado do kit', (await painel.getByRole('region', { name: 'Peças de revisão' }).count()) === 0);
  });

  await step('Máquina sem revisão na lista fica em silêncio', async () => {
    const painel = await abrirMaquinaPorPnc('970619901');
    check('nenhum painel de revisão', (await painel.getByRole('region', { name: 'Peças de revisão' }).count()) === 0);
  });

  await step('A rota: sem login 401; PNC curto ou lixo devolve lista vazia, nunca 500', async () => {
    const semLogin = await fetch('http://127.0.0.1:5173/api/machines/970466903/service-parts');
    check('sem login: 401', semLogin.status === 401, String(semLogin.status));
    for (const pnc of ['123', 'abc', '99999999999999999']) {
      const r = await page.request.get(`http://127.0.0.1:5173/api/machines/${pnc}/service-parts`);
      const corpo = await r.json().catch(() => null);
      check(`PNC "${pnc}": 200 e lista vazia`, r.status() === 200 && Array.isArray(corpo?.parts) && corpo.parts.length === 0, `${r.status()} ${JSON.stringify(corpo)}`);
    }
  });
} finally {
  restaurar();
}

await finish(browser, errors);
