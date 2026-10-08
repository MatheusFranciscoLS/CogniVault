// Tela de LOGIN inteira, e a saída (logout) e a proteção das rotas.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/login-completo.mjs [tema]
import { open, check, step, finish, shot, BASE, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'dark', login: false });
const email = page.getByLabel('E-mail');
const senha = page.locator('#login-password');
const entrar = page.getByRole('button', { name: 'Entrar', exact: true });

await page.goto(BASE + '/login');
await email.waitFor();

await step('conteúdo da tela', async () => {
  const texto = await page.locator('body').innerText();
  check('mostra a marca da loja e o selo ouro', /Vardão/.test(texto) && /OURO/i.test(texto));
  check('sem texto de marketing explicando o sistema', texto.length < 600, `${texto.length} caracteres`);
  check('campo e-mail com autocomplete=email', (await email.getAttribute('autocomplete')) === 'email');
  check('campo senha com autocomplete=current-password', (await senha.getAttribute('autocomplete')) === 'current-password');
  check('o foco já está no e-mail ao abrir', await email.evaluate(el => el === document.activeElement));
  await shot(page, `${theme}-1366-login`);
});

await step('mostrar senha', async () => {
  await senha.fill('segredo');
  check('a senha começa escondida', (await senha.getAttribute('type')) === 'password');
  await page.getByRole('button', { name: 'Mostrar senha' }).click();
  check('"Mostrar" revela a senha', (await senha.getAttribute('type')) === 'text');
  check('o botão passa a oferecer esconder', await page.getByRole('button', { name: /Ocultar senha|Esconder senha/ }).count() > 0);
  await page.getByRole('button', { name: /Ocultar senha|Esconder senha/ }).click();
  check('"Ocultar" esconde de novo', (await senha.getAttribute('type')) === 'password');
});

await step('validação', async () => {
  await senha.fill('');
  await entrar.click();
  await page.waitForTimeout(500);
  const aindaNoLogin = page.url().includes('/login');
  check('enviar vazio não entra', aindaNoLogin);
  const validacao = await email.evaluate(el => el.validationMessage);
  console.log(`   mensagem do navegador para e-mail vazio: "${validacao}"`);
  await email.fill('isso-nao-e-email');
  await senha.fill('x');
  await entrar.click();
  await page.waitForTimeout(500);
  check('e-mail inválido não entra', page.url().includes('/login'));
});

await step('senha errada', async () => {
  await email.fill('admin.e2e@cognivault.local');
  await senha.fill('senha-errada-123');
  await entrar.click();
  const erro = page.getByRole('alert');
  await erro.waitFor({ timeout: 10000 });
  const mensagem = await erro.innerText();
  console.log(`   mensagem de erro: "${mensagem.replace(/\s+/g, ' ')}"`);
  check('mostra erro e fica na tela de login', page.url().includes('/login') && mensagem.length > 5);
  check('o erro não revela se o e-mail existe', !/não encontrad|não existe|inexistente/i.test(mensagem));
  check('os campos continuam preenchidos (não apaga o e-mail)', (await email.inputValue()) === 'admin.e2e@cognivault.local');
  await shot(page, `${theme}-1366-login-erro`);
});

await step('entrar com Enter', async () => {
  await senha.fill('CogniVault-E2E-2026!');
  await senha.press('Enter');
  await page.waitForURL(/\/atendimento/, { timeout: 15000 });
  await page.getByPlaceholder(SEARCH).waitFor({ timeout: 15000 });
  check('Enter na senha envia e abre o painel', true);
});

await step('login com sessão ativa', async () => {
  await page.goto(BASE + '/login');
  await page.waitForTimeout(1500);
  check('quem já está logado e abre /login volta para o painel', page.url().includes('/atendimento'), page.url().replace(BASE, ''));
});

await step('sair', async () => {
  await page.getByRole('button', { name: 'Minha conta' }).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await page.waitForURL(/\/login/, { timeout: 15000 });
  check('Sair leva ao login', page.url().includes('/login'));
  await page.goto(BASE + '/dashboard');
  await page.waitForTimeout(1500);
  check('depois de sair, abrir /dashboard manda para o login', page.url().includes('/login'));
  await page.goBack().catch(() => {});
  await page.waitForTimeout(800);
  const protegido = await page.getByPlaceholder(SEARCH).count();
  check('o botão Voltar do navegador não reabre o painel logado', protegido === 0);
  const rascunho = await page.evaluate(() => Object.keys(localStorage).filter(k => /quote|counter_session/i.test(k)));
  console.log(`   chaves de orçamento/atendimento que ficaram no navegador depois de sair: ${rascunho.join(', ') || 'nenhuma'}`);
});

await step('celular (só não pode quebrar)', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/login');
  await page.waitForTimeout(800);
  const estouro = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check('sem rolagem horizontal em 390px', !estouro);
  await shot(page, `${theme}-390-login`);
});

// 401 é esperado aqui: a senha errada de propósito e a consulta de sessão de quem ainda não entrou.
errors.splice(0, errors.length, ...errors.filter(e => !/401/.test(e)));
await finish(browser, errors);
