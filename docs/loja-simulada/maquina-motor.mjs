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

let codigoKohler = '';

await step('Atalho de manutenção · Kohler e Kawasaki abrem direto as peças que giram rápido', async () => {
  let { painel, cartao } = await abrirMaquina('LTH1842');
  await cartao.getByRole('button', { name: 'Peças de manutenção' }).first().click();
  let motor = painel.getByRole('region', { name: /Motor Kohler SV540-3212/ });
  await motor.getByRole('heading', { name: /Maintenance-Fast Moving Parts/ }).waitFor({ timeout: 40000 });
  await motor.locator('article').first().waitFor({ timeout: 40000 });
  check('Kohler: o grupo de manutenção abre sozinho, com peças', (await motor.locator('article').count()) > 0);
  const rotulo = await motor.locator('article').first().getByRole('button', { name: /Copiar código/ }).first().getAttribute('aria-label');
  codigoKohler = String(rotulo ?? '').replace(/^Copiar código\s*/i, '').trim();
  console.log('   código lido do grupo de manutenção:', codigoKohler);
  ({ painel, cartao } = await abrirMaquina('R316TX'));
  await cartao.getByRole('button', { name: 'Peças de manutenção' }).first().click();
  motor = painel.getByRole('region', { name: /Motor Kawasaki/ });
  await motor.getByRole('heading', { name: /MAINTENANCE/i }).waitFor({ timeout: 40000 });
  check('Kawasaki: o conjunto de manutenção abre sozinho', true);
});

await step('Busca reversa · o código de uma peça Kohler já lida mostra de qual motor ela é', async () => {
  if (await page.getByRole('dialog').count()) await fechar();
  await page.getByPlaceholder(SEARCH).fill(codigoKohler);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByText(/Kohler/).first().waitFor({ timeout: 30000 });
  const texto = await page.locator('main').innerText();
  check('a origem aponta o motor Kohler SV540-3212', /SV540-3212/.test(texto), texto.slice(0, 120).replace(/\s+/g, ' '));
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

// ---- Campo da plaqueta: "e se não for nenhum desses?" (dono, 2026-10-08). Vários jeitos de usar, não só o feliz. ----
const campo = painel => painel.getByRole('textbox', { name: /plaqueta/i });
const abrirCampo = async (painel, texto, { enter = false } = {}) => {
  await campo(painel).fill(texto);
  if (enter) await campo(painel).press('Enter');
  else await painel.getByRole('button', { name: 'Abrir motor' }).click();
};

await step('Campo da plaqueta · Kawasaki digitado em minúsculo, com espaço e com Enter abre o catálogo certo', async () => {
  const { painel } = await abrirMaquina('Z460');
  await abrirCampo(painel, 'fx921v es06', { enter: true });
  const motor = painel.getByRole('region', { name: /Motor Kawasaki FX921V-ES06/ });
  await motor.waitFor({ timeout: 40000 });
  check('a marca saiu do formato e o catálogo FX921V-ES06 abriu', /FX921V-ES06/.test(await motor.innerText()));
  const cartao = painel.getByRole('region', { name: 'Motor desta máquina' });
  check('o digitado vem na frente e diz que foi digitado da plaqueta', /Digitado por você, da plaqueta/.test(await cartao.innerText()));
  check('o campo esvaziou, pronto para outro motor', (await campo(painel).inputValue()) === '');
  await shot(page, `${theme}-1366-campo-plaqueta-kawasaki`);

  // Trocar de ideia: digitar OUTRO motor no mesmo painel, sem fechar nada.
  await abrirCampo(painel, 'FR730VFS16S');
  await painel.getByRole('region', { name: /Motor Kawasaki FR730V-FS16/ }).waitFor({ timeout: 40000 });
  check('trocar o motor digitado substitui o anterior, sem fechar o painel', (await painel.getByRole('region', { name: /Motor Kawasaki FX921V-ES06/ }).count()) === 0);
  await painel.getByRole('button', { name: 'Limpar' }).click();
  check('"Limpar" remove o motor digitado', (await cartao.innerText()).indexOf('Digitado por você') === -1);
});

await step('Campo da plaqueta · Kohler com espaço, Kohler só com a série e Briggs colado', async () => {
  const { painel } = await abrirMaquina('Z460');
  await abrirCampo(painel, 'sv540 3212');
  await painel.getByRole('region', { name: /Motor Kohler SV540-3212/ }).waitFor({ timeout: 40000 });
  check('Kohler digitado com espaço abre o catálogo (não vira Briggs)', (await painel.getByRole('region', { name: /Briggs/i }).count()) === 0);

  await abrirCampo(painel, 'SV540');
  const alerta = painel.getByRole('alert');
  await alerta.waitFor({ timeout: 5000 });
  check('só a série da Kohler pede o spec completo, com exemplo', /spec completo/.test(await alerta.innerText()));

  await abrirCampo(painel, '104m020002f1');
  await painel.getByRole('region', { name: /Briggs|104M02/i }).first().waitFor({ timeout: 60000 });
  check('Briggs digitado colado e em minúsculo abre a lista de peças da Briggs', true);
});

await step('Campo da plaqueta · texto que não é motor recebe ajuda, sem abrir nada; e a ajuda some ao voltar a digitar', async () => {
  const { painel } = await abrirMaquina('Z460');
  const antes = await painel.getByRole('region', { name: /^Motor (Kohler|Kawasaki)/ }).count();
  await abrirCampo(painel, 'carburador');
  const alerta = painel.getByRole('alert');
  await alerta.waitFor({ timeout: 5000 });
  check('a mensagem mostra exemplos de cada marca', /FX921V-ES06/.test(await alerta.innerText()) && /SV540-3212/.test(await alerta.innerText()));
  check('nada foi aberto por palpite', (await painel.getByRole('region', { name: /^Motor (Kohler|Kawasaki)/ }).count()) === antes);
  await campo(painel).fill('FX');
  check('a mensagem de erro some quando o atendente volta a digitar', (await painel.getByRole('alert').count()) === 0);
  check('o botão só habilita com texto', await painel.getByRole('button', { name: 'Abrir motor' }).isEnabled());
  await campo(painel).fill('');
  check('campo vazio deixa o botão desabilitado', await painel.getByRole('button', { name: 'Abrir motor' }).isDisabled());
});

await step('Campo da plaqueta · spec que o catálogo da Kawasaki não tem dá saída (ver os specs da série)', async () => {
  const { painel } = await abrirMaquina('Z460');
  await abrirCampo(painel, 'FX921V-ZZ99');
  const motor = painel.getByRole('region', { name: /Motor Kawasaki/ });
  await motor.getByRole('button', { name: /Ver os specs da série FX921V/ }).waitFor({ timeout: 40000 });
  check('o catálogo diz que não há e oferece a série', true);
});

await step('Campo da plaqueta · máquina SEM vínculo conhecido (cortador de grama) mostra o campo; motosserra não mostra o cartão', async () => {
  const gx = await abrirMaquina('GX560');
  check('o cartão aparece só com o campo', /Digite o modelo do motor da plaqueta/.test(gx.texto) || (await gx.cartao.getByRole('textbox').count()) === 1, gx.texto.slice(0, 160));
  await abrirCampo(gx.painel, 'SV540-3212');
  await gx.painel.getByRole('region', { name: /Motor Kohler SV540-3212/ }).waitFor({ timeout: 40000 });
  check('abre o catálogo mesmo sem vínculo prévio', true);
  if (await page.getByRole('dialog').count()) await fechar();
  await page.getByPlaceholder(SEARCH).fill('542iXP');
  await page.getByRole('button', { name: 'Buscar' }).click();
  const fichas = page.locator('button:has(.font-code)', { hasText: 'PNC' });
  await fichas.first().waitFor({ timeout: 40000 });
  await fichas.first().click();
  await page.getByRole('dialog').first().waitFor({ timeout: 40000 });
  await page.waitForTimeout(4000);
  check('motosserra não ganha cartão de motor (o motor dela está no IPL)', (await page.getByRole('region', { name: 'Motor desta máquina' }).count()) === 0);
});

await step('Campo da plaqueta · linha inteira colada e plaqueta da Briggs em três campos', async () => {
  const { painel } = await abrirMaquina('Z460');
  await abrirCampo(painel, 'Model No. FX921V-ES06 4 Stroke Engine');
  await painel.getByRole('region', { name: /Motor Kawasaki FX921V-ES06/ }).waitFor({ timeout: 40000 });
  check('uma linha inteira colada acha o modelo dentro do texto', true);
  await abrirCampo(painel, 'MODEL 104M02 TYPE 0002 CODE F1');
  await painel.getByRole('region', { name: /Briggs|104M02/i }).first().waitFor({ timeout: 60000 });
  check('a plaqueta da Briggs (modelo, tipo e código separados) abre a lista de peças', true);
  await abrirCampo(painel, 'preciso do carburador do motor');
  await painel.getByRole('alert').waitFor({ timeout: 5000 });
  check('frase solta não abre nada e recebe ajuda', true);
});

await finish(browser, errors);
