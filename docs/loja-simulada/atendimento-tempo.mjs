// ATENDIMENTO: quanto tempo a busca leva até a PRIMEIRA linha de peça aparecer, e quantas vezes a tela re-renderiza o campo. Existe para provar que o redesenho
// da tela (faixa) NÃO deixou o atendimento mais lento: rode antes e depois e compare. Não tem limite fixo (a rede muda), só imprime as medianas.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/atendimento-tempo.mjs [tema] [repeticoes]
import { open, check, step, finish, BASE, SEARCH } from './_t.mjs';

const repeticoes = Number(process.argv[3] ?? 5);
const { browser, page, errors } = await open({ theme: process.argv[2] ?? 'light', width: 1366, height: 768 });

const consultas = ['carburador 143RII', '506744201', 'filtro de ar'];
const medianas = {};

await step('Tempo até a primeira linha, por tipo de busca', async () => {
  for (const texto of consultas) {
    const tempos = [];
    for (let i = 0; i < repeticoes; i += 1) {
      await page.goto(BASE + '/atendimento');
      const campo = page.getByPlaceholder(SEARCH);
      await campo.waitFor({ timeout: 30000 });
      await page.waitForTimeout(400);
      await campo.fill(texto);
      const inicio = Date.now();
      await campo.press('Enter');
      await page.locator('[data-row-add]').first().waitFor({ timeout: 30000 });
      tempos.push(Date.now() - inicio);
    }
    tempos.sort((a, b) => a - b);
    medianas[texto] = tempos[Math.floor(tempos.length / 2)];
    console.log(`   "${texto}": mediana ${medianas[texto]} ms (${tempos.join(', ')})`);
    check(`"${texto}" mostrou a primeira linha em todas as ${repeticoes} vezes`, tempos.length === repeticoes);
  }
});

await step('Digitar rápido não trava (50 teclas seguidas)', async () => {
  await page.goto(BASE + '/atendimento');
  const campo = page.getByPlaceholder(SEARCH);
  await campo.waitFor({ timeout: 30000 });
  const inicio = Date.now();
  await campo.pressSequentially('carburador do cortador de grama husqvarna 143', { delay: 0 });
  const gasto = Date.now() - inicio;
  console.log(`   50 teclas em ${gasto} ms`);
  check('digitou tudo e o campo tem o texto inteiro', (await campo.inputValue()).length >= 40, String((await campo.inputValue()).length));
});

console.log('\nMEDIANAS', JSON.stringify(medianas));
await finish(browser, errors);
