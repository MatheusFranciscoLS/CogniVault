// Máquina + motor vinculados: o painel da máquina mostra a vista explodida DELA e, no cartão "Motor desta máquina", a do MOTOR.
// Cobre os quatro fabricantes: Kohler (LTH1842), Kawasaki (R316TX), Husqvarna (TS138) e Briggs (LC121P).
// Precisa de internet (Portal Husqvarna, Kohler, Kawasaki ARI, Briggs).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/maquina-motor.mjs [tema]
import { open, check, step, finish, shot, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });

async function abrirMaquina(modelo) {
  // Um passo que falhou deixa o painel aberto: fecha antes de começar o seguinte, para a falha de um não derrubar os outros.
  if (await page.getByRole('dialog').count()) await fechar();
  await page.getByPlaceholder(SEARCH).fill(modelo);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const fichas = page.locator('button:has(.font-code)', { hasText: 'PNC' });
  await fichas.first().waitFor({ timeout: 40000 });
  await fichas.first().click();
  const painel = page.getByRole('dialog').first();
  await painel.waitFor({ timeout: 40000 });
  return painel;
}

const fechar = async () => {
  await page.locator('[role="dialog"] button[aria-label="Fechar"]').first().click();
  await page.getByRole('dialog').first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
};

/** A vista explodida da PRÓPRIA máquina (painel do Portal): região própria, com o desenho e as posições. */
const vistaDaMaquina = painel => painel.getByRole('region', { name: 'Vistas explodidas da máquina' });

await step('Kohler: LTH1842 mostra a vista da máquina e, ao abrir o motor, a vista do motor SV540-3212', async () => {
  const painel = await abrirMaquina('LTH1842');
  const cartao = painel.getByRole('region', { name: 'Motor desta máquina' });
  await cartao.waitFor({ timeout: 40000 });
  check('o cartão do motor traz a nota da plaqueta', /plaqueta/.test(await cartao.innerText()));
  await cartao.getByRole('button', { name: 'Ver peças e vista explodida' }).click();
  const motor = painel.getByRole('region', { name: /Motor Kohler SV540-3212/ });
  await motor.getByRole('button', { name: 'CrankShaft' }).click();
  await motor.locator('article').first().waitFor({ timeout: 40000 });
  await motor.locator('[data-hotspot="true"]').first().waitFor({ timeout: 40000 });
  check('a vista do MOTOR aparece com posições clicáveis dentro do painel da máquina', (await motor.locator('[data-hotspot="true"]').count()) >= 7);
  const dela = vistaDaMaquina(painel);
  check('a vista da MÁQUINA continua no mesmo painel, acima do motor', (await dela.count()) === 1);
  console.log('   desenhos da máquina:', await dela.locator('img').count(), '| do motor:', await motor.locator('img').count());
  await shot(page, `${theme}-1366-maquina-e-motor-kohler`);
  await fechar();
});

await step('Kawasaki: R316TX abre o catálogo do motor FS481V-CS55 dentro da máquina', async () => {
  const painel = await abrirMaquina('R316TX');
  const cartao = painel.getByRole('region', { name: 'Motor desta máquina' });
  await cartao.waitFor({ timeout: 40000 });
  check('mostra a marca e o modelo do motor', /Kawasaki/.test(await cartao.innerText()) && /FS481V-CS55/.test(await cartao.innerText()));
  await cartao.getByRole('button', { name: 'Ver peças e vista explodida' }).click();
  const motor = painel.getByRole('region', { name: /Motor Kawasaki/ });
  await motor.waitFor({ timeout: 40000 });
  check('abre o catálogo Kawasaki do motor', /Kawasaki/.test(await motor.innerText()));
  // As DUAS vistas ao mesmo tempo: a da máquina (Portal Husqvarna) e a do motor (ARI da Kawasaki), cada uma com as suas posições.
  await motor.getByRole('button', { pressed: false }).first().click();
  await motor.locator('[data-hotspot="true"]').first().waitFor({ timeout: 40000 });
  const daMaquina = await vistaDaMaquina(painel).locator('[data-hotspot="true"]').count();
  const doMotor = await motor.locator('[data-hotspot="true"]').count();
  console.log('   posições clicáveis -> máquina:', daMaquina, '| motor:', doMotor);
  check('a vista da máquina e a do motor têm posições clicáveis ao mesmo tempo', daMaquina > 0 && doMotor > 0, `${daMaquina} / ${doMotor}`);
  await shot(page, `${theme}-1366-maquina-e-motor-kawasaki`);
  await fechar();
});

await step('Husqvarna: TS138 mostra os motores do IPL por PNC', async () => {
  const painel = await abrirMaquina('TS138');
  const cartao = painel.getByRole('region', { name: 'Motor desta máquina' });
  await cartao.waitFor({ timeout: 40000 });
  const texto = await cartao.innerText();
  check('lista o HS452 (base do dono e do IPL)', /HS452/.test(texto), texto.replace(/\s+/g, ' ').slice(0, 160));
  await fechar();
});

await step('Briggs: LC121P mostra o motor 104M02-0002-F1 e abre a lista de peças', async () => {
  const painel = await abrirMaquina('LC121P');
  const cartao = painel.getByRole('region', { name: 'Motor desta máquina' });
  await cartao.waitFor({ timeout: 40000 });
  check('mostra o motor Briggs', /104M02-0002-F1/.test(await cartao.innerText()));
  await cartao.getByRole('button', { name: 'Ver peças e vista explodida' }).click();
  await painel.getByRole('region', { name: /Briggs|104M02/i }).first().waitFor({ timeout: 60000 });
  check('abre o painel do motor Briggs', true);
  await fechar();
});

await finish(browser, errors);
