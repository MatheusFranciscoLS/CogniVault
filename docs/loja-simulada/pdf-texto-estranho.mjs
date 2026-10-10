// PDF com TEXTO ESTRANHO (rodada 2 de auditoria, 2026-10-09): emoji colado do WhatsApp, árabe, japonês, quebra de linha, 400 letras, símbolos.
// Antes, um emoji estragava o espaçamento da frase inteira no PDF do cliente ("I t e m  1") e o resto virava lixo. Confere os bytes do PDF baixado.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/pdf-texto-estranho.mjs [tema]
import fs from 'node:fs';
import path from 'node:path';
import { open, check, step, finish, sqlSim, OUT } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const limpar = () => sqlSim(`DELETE FROM "Quote" WHERE "status" = 'DRAFT'`);
const lerPdf = caminho => fs.readFileSync(caminho).toString('latin1').replace(/\\([()])/g, '$1');
const lixo = bruto => ['I t e m', 'Ø=Þ', 'Ø='].filter(trecho => bruto.includes(trecho));

try {
  await step('Conserto: cada nome estranho gera o PDF, sem lixo e sem estragar a frase', async () => {
    limpar();
    await page.evaluate(() => ['cognivault_repair_cart', 'cognivault_repair_draft_options'].forEach(k => localStorage.removeItem(k)));
    await page.goto(new URL('/conserto', page.url()).href);
    const ed = page.getByRole('region', { name: 'Orçamento de conserto' });
    await ed.waitFor({ timeout: 20000 });
    await page.waitForTimeout(1200);
    const casos = [
      ['João 😀 Müller & Cia - Ltda', 'João Müller & Cia - Ltda', 'emoji no meio do nome'],
      ['Fazenda 🚜🇧🇷 Boa Vista 👍🏽', 'Fazenda Boa Vista', 'vários emoji, bandeira e tom de pele'],
      ['مرحبا بالعميل', '?????', 'árabe vira ? (a falta aparece)'],
      ['日本語の顧客', '??????', 'japonês vira ?'],
      ['Linha 1\nLinha 2', 'Linha 1', 'quebra de linha no nome'],
      ['Zero' + String.fromCharCode(0x200b) + 'width ã ç é', 'Zerowidth ã ç é', 'espaço de largura zero'],
      ['A'.repeat(400), 'AAAAAAAAAAAAAAAAAAAA', '400 letras'],
      ['Preço ≥ 5 → ok', 'Preço >= 5 -> ok', 'símbolos viram letras'],
    ];
    let numero = 0;
    for (const [cliente, esperado, rotulo] of casos) {
      numero += 1;
      await page.getByLabel('Cliente', { exact: true }).fill(cliente);
      await ed.getByLabel('Descrição do serviço ou item').fill(`Item ${numero} 😀 ção`);
      await ed.getByLabel('Valor unitário (R$)').fill('12.5');
      await ed.getByLabel('Valor unitário (R$)').press('Enter');
      await page.waitForTimeout(400);
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), ed.getByRole('button', { name: 'PDF', exact: true }).click()]);
      const destino = path.join(OUT, `pdf-texto-${theme}-${numero}.pdf`);
      await download.saveAs(destino);
      const bruto = lerPdf(destino);
      check(`${rotulo}: baixou um PDF`, bruto.startsWith('%PDF'));
      check(`${rotulo}: o nome aparece como esperado ("${esperado.slice(0, 24)}")`, bruto.includes(esperado), esperado);
      check(`${rotulo}: sem lixo nem letras espaçadas`, lixo(bruto).length === 0, lixo(bruto).join(' | '));
      check(`${rotulo}: a descrição ficou inteira ("Item ${numero} ção")`, bruto.includes(`Item ${numero} ção`));
    }
  });

  await step('Orçamento de máquina: emoji no complemento e na observação não estraga o PDF', async () => {
    limpar();
    await page.getByRole('button', { name: 'Tabela de preços', exact: true }).click();
    await page.locator('main tbody tr td').first().waitFor({ timeout: 15000 });
    const alvo = sqlSim(`SELECT pnc || '|' || model FROM "MachineListing" WHERE upper(regexp_replace(model, '[^A-Za-z0-9]', '', 'g')) = 'Z460' ORDER BY pnc LIMIT 1`);
    const [pnc, nome] = alvo.split('|');
    await page.getByLabel('Buscar máquina na tabela').fill(pnc);
    await page.locator('main tbody tr', { hasText: pnc }).locator('td').first().getByRole('button').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Orçamento', exact: true }).click();
    const dialogo = page.getByRole('dialog', { name: new RegExp(`Orçamento da ${nome}`) });
    await dialogo.waitFor({ timeout: 5000 });
    await dialogo.getByLabel('Cliente (A/C)').fill('Sítio 🌳 São José 日本');
    await dialogo.getByLabel('Complemento da descrição').fill('com transmissão hidrostática 💪 e 2 câmbios ≥ 13 estágios');
    await dialogo.getByLabel('Observação').fill('Entrega em 7 dias 🚚 - confirmar');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), dialogo.getByRole('button', { name: /Baixar orçamento em PDF/ }).click()]);
    const destino = path.join(OUT, `pdf-texto-maquina-${theme}.pdf`);
    await download.saveAs(destino);
    const bruto = lerPdf(destino);
    check('o PDF da máquina sai', bruto.startsWith('%PDF'));
    check('cliente sem o emoji e com ? onde faltou a letra', bruto.includes('Sítio São José ??'), 'Sítio São José ??');
    check('o complemento perde só o emoji', bruto.includes('transmissão hidrostática e 2 câmbios >= 13 estágios'));
    check('a observação perde só o emoji', bruto.includes('Entrega em 7 dias - confirmar'));
    check('sem lixo', lixo(bruto).length === 0, lixo(bruto).join(' | '));
  });
} finally {
  limpar();
}

await finish(browser, errors);
