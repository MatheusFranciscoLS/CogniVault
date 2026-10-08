// Tela USUÁRIOS (administração) inteira: lista, filtro, novo usuário, perfil, bloqueio e redefinição de senha.
// Usa um usuário de teste criado na hora e apagado no fim (só na loja simulada).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/usuarios-completo.mjs [tema]
import { open, check, step, finish, shot, confirmar, sqlSim } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'dark' });
const emailTeste = `teste.${Date.now()}@cognivault.local`;
const senhaInicial = 'SenhaDeTeste-2026-abc';

await page.getByRole('button', { name: 'Administração' }).click();
await page.getByRole('menuitem', { name: 'Usuários' }).click();
await page.getByRole('heading', { name: 'Usuários', level: 1 }).waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
const linhaDe = email => page.locator('li', { hasText: email });

await step('cabeçalho e lista', async () => {
  check('título e botão "Novo usuário"', await page.getByRole('button', { name: 'Novo usuário' }).isVisible());
  const texto = await page.locator('main').innerText();
  check('a lista mostra o administrador de teste com perfil e status', texto.includes('admin.e2e@cognivault.local') && texto.includes('Administrador') && texto.includes('Ativo'));
  check('mostra a contagem de usuários', /\d+ usuários?/.test(texto));
  check('sem frase que explica a tela', !/Crie acessos, altere perfil/.test(texto));
  await shot(page, `${theme}-1366-usuarios`);
});

await step('novo usuário', async () => {
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  const form = page.locator('form', { has: page.getByLabel('E-mail do novo usuário') });
  await page.getByLabel('E-mail do novo usuário').fill(emailTeste);
  await page.getByLabel('Senha inicial').fill('curta');
  await form.getByRole('button', { name: 'Criar acesso' }).click();
  await page.waitForTimeout(400);
  check('senha curta não cria o usuário (mínimo 15 caracteres)', (await linhaDe(emailTeste).count()) === 0);
  await page.getByLabel('Senha inicial').fill(senhaInicial);
  await form.getByRole('button', { name: 'Criar acesso' }).click();
  await linhaDe(emailTeste).waitFor({ timeout: 10000 });
  const linha = await linhaDe(emailTeste).innerText();
  check('o usuário novo aparece como Balcão e Ativo', /Balcão/.test(linha) && /Ativo/.test(linha), linha.replace(/\s+/g, ' ').slice(0, 80));
  check('o formulário fecha depois de criar', (await page.getByLabel('E-mail do novo usuário').count()) === 0);
});

await step('filtro', async () => {
  const filtro = page.getByLabel('Filtrar usuários');
  await filtro.fill('zzzqqq');
  check('filtro sem resultado avisa', await page.getByText('Nenhum usuário encontrado.').isVisible());
  await filtro.fill('teste.');
  await page.waitForTimeout(300);
  check('filtrar por parte do e-mail acha o usuário', (await linhaDe(emailTeste).count()) === 1);
  await filtro.fill('bloqueado');
  await page.waitForTimeout(300);
  check('filtrar por status funciona', (await linhaDe(emailTeste).count()) === 0);
  await filtro.fill('');
});

await step('menu de ações', async () => {
  await linhaDe(emailTeste).getByRole('button', { name: /Ações de/ }).click();
  const itens = await page.getByRole('menuitem').allInnerTexts();
  check('o menu tem perfil, nome, bloqueio e senha', itens.length === 4 && /administrador/.test(itens[0]) && /nome/.test(itens[1]) && /Bloquear/.test(itens[2]) && /senha/.test(itens[3]), itens.join(' | '));
  await page.keyboard.press('Escape');
});

await step('mudar perfil (com confirmação)', async () => {
  await linhaDe(emailTeste).getByRole('button', { name: /Ações de/ }).click();
  await page.getByRole('menuitem', { name: 'Tornar administrador' }).click();
  const texto = await page.getByRole('alertdialog').innerText();
  check('pergunta antes e diz o que muda', /administrador/.test(texto) && /vê a loja inteira/.test(texto));
  await confirmar(page, 'Tornar administrador');
  await page.waitForTimeout(800);
  check('o perfil vira Administrador', /Administrador/.test(await linhaDe(emailTeste).innerText()));
  await linhaDe(emailTeste).getByRole('button', { name: /Ações de/ }).click();
  await page.getByRole('menuitem', { name: 'Tornar Balcão' }).click();
  await confirmar(page, 'Tornar Balcão');
  await page.waitForTimeout(800);
  check('e volta para Balcão', /Balcão/.test(await linhaDe(emailTeste).innerText()));
});

await step('bloquear e ativar', async () => {
  await linhaDe(emailTeste).getByRole('button', { name: /Ações de/ }).click();
  await page.getByRole('menuitem', { name: 'Bloquear' }).click();
  const texto = await page.getByRole('alertdialog').innerText();
  check('bloquear pergunta antes, em vermelho, dizendo o efeito', /Bloquear/.test(texto) && /sai do sistema/.test(texto));
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
  await page.waitForTimeout(400);
  check('cancelar não bloqueia', /Ativo/.test(await linhaDe(emailTeste).innerText()));
  await linhaDe(emailTeste).getByRole('button', { name: /Ações de/ }).click();
  await page.getByRole('menuitem', { name: 'Bloquear' }).click();
  await confirmar(page, 'Bloquear');
  await page.waitForTimeout(800);
  check('confirmar bloqueia', /Bloqueado/.test(await linhaDe(emailTeste).innerText()));
  await linhaDe(emailTeste).getByRole('button', { name: /Ações de/ }).click();
  await page.getByRole('menuitem', { name: 'Ativar' }).click();
  await page.waitForTimeout(800);
  check('ativar volta ao normal, sem perguntar', /Ativo/.test(await linhaDe(emailTeste).innerText()) && (await page.getByRole('alertdialog').count()) === 0);
});

await step('redefinir senha', async () => {
  await linhaDe(emailTeste).getByRole('button', { name: /Ações de/ }).click();
  await page.getByRole('menuitem', { name: 'Redefinir senha' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Redefinir senha' });
  await dialogo.waitFor();
  check('o diálogo mostra de quem é a senha', (await dialogo.innerText()).includes(emailTeste));
  await dialogo.getByLabel('Nova senha').fill('curta');
  await dialogo.getByRole('button', { name: 'Redefinir' }).click();
  await page.waitForTimeout(300);
  // O campo tem minLength=15: o navegador barra a senha curta antes de enviar (mensagem própria dele).
  check('senha curta não envia e o diálogo continua aberto', await dialogo.isVisible() && (await page.getByText('Senha redefinida.').count()) === 0);
  await shot(page, `${theme}-1366-usuarios-senha`);
  await dialogo.getByLabel('Nova senha').fill('OutraSenhaDeTeste-2026-xyz');
  await dialogo.getByRole('button', { name: 'Redefinir' }).click();
  await dialogo.waitFor({ state: 'detached', timeout: 10000 });
  check('senha válida fecha o diálogo e avisa', await page.getByText('Senha redefinida.').isVisible());
});

await step('a senha nova funciona de verdade', async () => {
  const resposta = await page.request.post('http://127.0.0.1:5173/api/login', { data: { email: emailTeste, password: 'OutraSenhaDeTeste-2026-xyz' }, headers: { Origin: 'http://127.0.0.1:5173' } });
  check('o usuário de teste entra com a senha nova', resposta.ok(), `HTTP ${resposta.status()}`);
});

// limpeza (loja simulada): o usuário de teste e o rastro dele
try {
  sqlSim(`DELETE FROM "AuditLog" WHERE "userId" IN (SELECT id FROM "User" WHERE email = '${emailTeste}')`);
  sqlSim(`DELETE FROM "User" WHERE email = '${emailTeste}'`);
} catch (e) { console.log('   limpeza do usuário de teste falhou:', String(e.message).split('\n')[0]); }

await finish(browser, errors);
