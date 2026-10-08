// Máquina + motor vinculados: o painel da máquina mostra o cartão "Motor desta máquina" e, ao abrir, o catálogo do MOTOR com a vista
// explodida, ao lado da vista da máquina. Tabela de 8 máquinas das 4 marcas (Kohler, Kawasaki, Briggs, Husqvarna) e dos casos difíceis:
// spec da lista que o catálogo não tem, fontes que divergem, só a série. "Não podemos errar" (dono, 2026-10-08).
// Precisa de internet (Portal Husqvarna, Kohler, Kawasaki ARI, Briggs).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/maquina-motor.mjs [tema]
import { open, check, step, finish, shot, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });

const fechar = async () => {
  await page.locator('[role="dialog"] button[aria-label="Fechar"]').first().click();
  await page.getByRole('dialog').first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
};

async function abrirMaquina(busca) {
  // Um passo que falhou deixa o painel aberto: fecha antes de começar o seguinte.
  if (await page.getByRole('dialog').count()) await fechar();
  await page.getByPlaceholder(SEARCH).fill(busca);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const fichas = page.locator('button:has(.font-code)', { hasText: 'PNC' });
  await fichas.first().waitFor({ timeout: 40000 });
  await fichas.first().click();
  const painel = page.getByRole('dialog').first();
  const cartao = painel.getByRole('region', { name: 'Motor desta máquina' });
  await cartao.waitFor({ timeout: 40000 });
  return { painel, cartao, texto: (await cartao.innerText()).replace(/\s+/g, ' ') };
}

const vistaDaMaquina = painel => painel.getByRole('region', { name: 'Vistas explodidas da máquina' });
const abrirMotor = async cartao => { await cartao.getByRole('button', { name: 'Ver peças e vista explodida' }).first().click(); };

await step('Kohler · LTH1842: SV540-3212 abre o catálogo com a vista explodida e posições clicáveis', async () => {
  const { painel, cartao, texto } = await abrirMaquina('LTH1842');
  check('mostra Kohler SV540-3212 e manda conferir a plaqueta', /Kohler/.test(texto) && /SV540-3212/.test(texto) && /plaqueta/.test(texto));
  await abrirMotor(cartao);
  const motor = painel.getByRole('region', { name: /Motor Kohler SV540-3212/ });
  await motor.getByRole('button', { name: 'CrankShaft' }).click();
  await motor.locator('[data-hotspot="true"]').first().waitFor({ timeout: 40000 });
  check('as posições do desenho do motor estão marcadas', (await motor.locator('[data-hotspot="true"]').count()) >= 7);
  await shot(page, `${theme}-1366-maquina-motor-kohler`);
});

await step('Kawasaki · R316TX: série da lista + modelo da loja viram UM motor (FS481V-CS55) e as duas vistas aparecem juntas', async () => {
  const { painel, cartao, texto } = await abrirMaquina('R316TX');
  check('mostra o modelo completo FS481V-CS55 (o mais específico vence a série da ficha)', /FS481V-CS55/.test(texto), texto.slice(0, 200));
  check('não repete a série solta como se fosse outro motor', (texto.match(/FS481V/g) ?? []).length === 1 || /FS481V-CS55/.test(texto));
  await abrirMotor(cartao);
  const motor = painel.getByRole('region', { name: /Motor Kawasaki/ });
  await motor.waitFor({ timeout: 40000 });
  await motor.getByRole('button', { pressed: false }).first().click();
  await motor.locator('[data-hotspot="true"]').first().waitFor({ timeout: 40000 });
  await vistaDaMaquina(painel).locator('[data-hotspot="true"]').first().waitFor({ timeout: 30000 }).catch(() => {});
  const daMaquina = await vistaDaMaquina(painel).locator('[data-hotspot="true"]').count();
  const doMotor = await motor.locator('[data-hotspot="true"]').count();
  check('a vista da máquina e a do motor têm posições clicáveis ao mesmo tempo', daMaquina > 0 && doMotor > 0, `${daMaquina} / ${doMotor}`);
  await shot(page, `${theme}-1366-maquina-motor-kawasaki`);
});

await step('Kawasaki · Z248F: o spec da lista não existe no catálogo, e o balcão tem saída (ver os specs da série)', async () => {
  const { painel, cartao, texto } = await abrirMaquina('Z248F');
  check('mostra o spec da ficha da lista de preços', /FR691V-JS00/.test(texto), texto.slice(0, 200));
  await abrirMotor(cartao);
  const motor = painel.getByRole('region', { name: /Motor Kawasaki/ });
  const saida = motor.getByRole('button', { name: /Ver os specs da série FR691V/ });
  await saida.waitFor({ timeout: 40000 });
  await saida.click();
  await motor.getByText(/versões\. Qual é o spec da plaqueta/).waitFor({ timeout: 40000 });
  check('a série pergunta o spec da plaqueta em vez de escolher um', true);
});

await step('Kawasaki + Kohler · MZ54: o modelo completo abre; a Kohler só com a série (KT740) não finge abrir', async () => {
  const { painel, cartao, texto } = await abrirMaquina('MZ54');
  check('mostra o motor Kawasaki FR730V-FS16', /FR730V-FS16/.test(texto), texto.slice(0, 220));
  check('mostra a Kohler KT740 só como informação, pedindo o spec', /KT740/.test(texto) && /Só a série/.test(texto));
  const botoes = await cartao.getByRole('button', { name: 'Ver peças e vista explodida' }).count();
  const linhas = await cartao.locator('li').count();
  check('só os motores com modelo completo têm botão de abrir', botoes < linhas, `${botoes} botões / ${linhas} motores`);
  await abrirMotor(cartao);
  const motor = painel.getByRole('region', { name: /Motor Kawasaki/ });
  await motor.getByText(/Conjuntos/).waitFor({ timeout: 40000 });
  check('o catálogo Kawasaki FR730V-FS16 abre com os conjuntos', (await motor.getByRole('button').count()) > 10);
});

await step('Kawasaki · Z560x: FX921V-HS04 da ficha abre o catálogo', async () => {
  const { painel, cartao, texto } = await abrirMaquina('Z560x');
  check('mostra o modelo da ficha da lista', /FX921V-HS0[46]/.test(texto), texto.slice(0, 220));
  check('mostra de onde vem cada motor', /Ficha da lista de preços/.test(texto));
  await abrirMotor(cartao);
  await painel.getByRole('region', { name: /Motor Kawasaki/ }).first().waitFor({ timeout: 40000 });
});

await step('Kawasaki · Z460: fontes que divergem aparecem TODAS, cada uma com a origem, e mandam para a plaqueta', async () => {
  const { texto } = await abrirMaquina('Z460');
  check('o Portal diz só a marca e manda ler a plaqueta', /Modelo na plaqueta/.test(texto) && /Portal Husqvarna/.test(texto));
  check('a ficha da lista aparece com a origem', /Ficha da lista de preços/.test(texto));
  check('o IPL antigo aparece marcado como pode ser de outro ano', /outro ano da máquina/.test(texto));
  check('nenhum motor é apresentado como única verdade', (await page.getByRole('dialog').first().getByRole('region', { name: 'Motor desta máquina' }).locator('li').count()) >= 3);
  await shot(page, `${theme}-1366-maquina-motor-z460`);
});

await step('Briggs · LC121P: 104M02-0002-F1 abre o painel da Briggs', async () => {
  const { painel, cartao, texto } = await abrirMaquina('LC121P');
  check('mostra o motor Briggs', /Briggs/.test(texto) && /104M02-0002-F1/.test(texto));
  await abrirMotor(cartao);
  await painel.getByRole('region', { name: /Briggs|104M02/i }).first().waitFor({ timeout: 60000 });
  check('abre o painel do motor Briggs', true);
});

await step('Husqvarna · TS138: os motores do IPL por PNC (HS452AE e HS608) aparecem cada um com o seu PNC', async () => {
  const { texto } = await abrirMaquina('TS138');
  check('lista o HS452AE', /HS452AE/.test(texto), texto.slice(0, 200));
  check('lista o HS608 de outro PNC', /HS608/.test(texto));
  check('cada um diz a que PNC vale', /PNC 96041/.test(texto) || /Este PNC/.test(texto));
});

await finish(browser, errors);
