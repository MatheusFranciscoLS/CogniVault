// USUÁRIOS no padrão de faixa (direção B do redesenho, 2026-10-10): quatro números e o campo de filtro dentro da faixa, a contagem no cabeçalho,
// e os números batendo com a tabela. Dois temas, 1366×768 (o PC do balcão). As ações (perfil, nome, bloqueio, senha) têm o roteiro `usuarios-completo.mjs`.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/usuarios-faixa.mjs [tema]
import { open, check, step, finish, shot, BASE } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light', width: 1366, height: 768 });
const textoDaTela = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
const numeroDe = async rotulo => {
  const texto = await page.locator('main').innerText();
  const achado = texto.match(new RegExp(`${rotulo}\\s*\\n\\s*([\\d.]+|—)`, 'i'));
  return achado ? achado[1] : null;
};

await page.goto(BASE + '/administracao/usuarios');
await page.getByLabel('Filtrar usuários').waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);

await step('A faixa mostra título, os quatro números e o filtro', async () => {
  check('há um único h1 "Usuários"', (await page.getByRole('heading', { level: 1 }).allInnerTexts()).join('|') === 'Usuários');
  const texto = (await textoDaTela()).toUpperCase();
  for (const rotulo of ['ATIVOS', 'ADMINISTRADORES', 'BALCÃO', 'BLOQUEADOS']) check(`a faixa tem "${rotulo}"`, texto.includes(rotulo));
  const filtro = page.getByLabel('Filtrar usuários');
  const caixa = await filtro.boundingBox();
  check('o filtro está dentro da faixa (acima da tabela, antes de 260 px)', caixa.y < 260, String(caixa.y));
  check('o botão "Novo usuário" está no cabeçalho', await page.getByRole('button', { name: 'Novo usuário' }).isVisible());
  const largura = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check('sem rolagem horizontal em 1366', largura.doc <= largura.win, JSON.stringify(largura));
  check('a tabela começa antes de 340 px', (await page.getByRole('table').boundingBox()).y < 340, String((await page.getByRole('table').boundingBox()).y));
  await shot(page, `${theme}-1366-usuarios-faixa`);
});

await step('Os números batem com a tabela', async () => {
  const linhas = await page.locator('tbody tr').evaluateAll(trs => trs.map(tr => tr.innerText.replace(/\s+/g, ' ')));
  const ativos = linhas.filter(l => /\bAtivo\b/.test(l)).length;
  const admins = linhas.filter(l => /Administrador/.test(l) && /\bAtivo\b/.test(l)).length;
  const balcao = linhas.filter(l => /Balcão/.test(l) && /\bAtivo\b/.test(l)).length;
  const bloqueados = linhas.length - ativos;
  check(`ATIVOS = ${ativos}`, (await numeroDe('ATIVOS')) === String(ativos), String(await numeroDe('ATIVOS')));
  check(`ADMINISTRADORES = ${admins}`, (await numeroDe('ADMINISTRADORES')) === String(admins), String(await numeroDe('ADMINISTRADORES')));
  check(`BALCÃO = ${balcao}`, (await numeroDe('BALCÃO')) === String(balcao), String(await numeroDe('BALCÃO')));
  check(`BLOQUEADOS = ${bloqueados}`, (await numeroDe('BLOQUEADOS')) === String(bloqueados), String(await numeroDe('BLOQUEADOS')));
  check('a contagem do cabeçalho é o total de linhas', (await textoDaTela()).includes(`${linhas.length} ${linhas.length === 1 ? 'usuário' : 'usuários'}`), String(linhas.length));
});

await step('Filtrar: a contagem acompanha, os números da faixa não mudam, e sem resultado há saída', async () => {
  const filtro = page.getByLabel('Filtrar usuários');
  const antes = await numeroDe('ATIVOS');
  await filtro.fill('mecanico');
  await page.waitForTimeout(300);
  const linhas = await page.locator('tbody tr').count();
  check('filtrar por "mecanico" deixa só as linhas que casam', linhas >= 1 && linhas < 50, String(linhas));
  check('a contagem do cabeçalho acompanha o filtro', (await textoDaTela()).includes(`${linhas} ${linhas === 1 ? 'usuário' : 'usuários'}`));
  check('os números da faixa continuam sendo os da loja inteira', (await numeroDe('ATIVOS')) === antes);
  await filtro.fill('zzz-ninguem-assim');
  await page.waitForTimeout(300);
  check('sem resultado diz "Nenhum usuário encontrado."', (await textoDaTela()).includes('Nenhum usuário encontrado.'));
  await filtro.fill('');
});

await step('Novo usuário abre o formulário e "Fechar" o fecha', async () => {
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  check('o formulário aparece', await page.getByLabel('E-mail do novo usuário').isVisible());
  check('o botão vira "Fechar"', await page.getByRole('button', { name: 'Fechar' }).isVisible());
  await page.waitForTimeout(500); // espera a transição de cor do botão antes do print
  await shot(page, `${theme}-1366-usuarios-faixa-novo`);
  await page.getByRole('button', { name: 'Fechar' }).click();
  check('fechar esconde o formulário', await page.getByLabel('E-mail do novo usuário').count() === 0);
});

await finish(browser, errors);
