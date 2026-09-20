import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Toda tabela do schema tem que ter uma migração ligando Row Level Security.
 *
 * **Isto existe por causa de um erro real.** Em 2026-09-19 a migração que criou
 * `OfficialPartIndex` esqueceu o RLS, e a tabela foi para produção como a única
 * aberta do banco. Testes passaram, build passou, oito deploys subiram verdes —
 * **nada no fluxo normal pegava**. Só apareceu porque fui olhar o painel do
 * Supabase, e o painel só avisa depois que a tabela já está lá.
 *
 * O risco não era a leitura (código de peça de catálogo público) e sim a
 * **escrita**: com a chave `anon`, dava para inserir um mapeamento peça→motor
 * falso, que apareceria no balcão como se viesse da fonte oficial. É a falha
 * que este produto inteiro existe para evitar.
 *
 * Ligar sem política não quebra o app: ele conecta como `postgres`, dono das
 * tabelas, e o dono passa por cima do RLS enquanto `FORCE ROW LEVEL SECURITY`
 * estiver desligado. Quem fica bloqueado são os papéis `anon` e `authenticated`
 * das bibliotecas cliente do Supabase — a intenção exata.
 *
 * O teste lê o `schema.prisma` e as migrações do disco, sem tocar em banco
 * nenhum, então roda em qualquer ambiente.
 */

const PRISMA_DIR = path.resolve(__dirname, '../../prisma');

function lerModelos(): string[] {
  const schema = fs.readFileSync(path.join(PRISMA_DIR, 'schema.prisma'), 'utf8');
  // Sem `@@map` em nenhum modelo deste schema (conferido), então o nome do
  // modelo é o nome da tabela. Se alguém introduzir `@@map`, este teste passa a
  // procurar o nome errado — e é por isso que ele falha alto em vez de pular.
  assert.equal(
    /@@map/.test(schema),
    false,
    'Apareceu @@map no schema: o nome da tabela deixou de ser o nome do modelo e este teste precisa aprender a ler o mapeamento.',
  );
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(m => m[1]);
}

function lerMigracoes(): string {
  const dir = path.join(PRISMA_DIR, 'migrations');
  return fs.readdirSync(dir)
    .filter(nome => fs.existsSync(path.join(dir, nome, 'migration.sql')))
    .map(nome => fs.readFileSync(path.join(dir, nome, 'migration.sql'), 'utf8'))
    .join('\n');
}

/**
 * Aceita as duas formas que o repositório usa, com ou sem o schema na frente:
 *
 *     ALTER TABLE public."Tenant" ENABLE ROW LEVEL SECURITY;
 *     ALTER TABLE "OfficialPartIndex" ENABLE ROW LEVEL SECURITY;
 */
function ligaRls(sql: string, tabela: string): boolean {
  const alvo = new RegExp(
    `ALTER\\s+TABLE\\s+(?:public\\.)?"${tabela}"\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'i',
  );
  return alvo.test(sql);
}

test('toda tabela do schema tem migração ligando RLS', () => {
  const modelos = lerModelos();
  const sql = lerMigracoes();

  // Sanidade: se a leitura falhar, o teste passaria vazio e não protegeria nada.
  assert.ok(modelos.length > 15, `Li só ${modelos.length} modelos do schema — a leitura quebrou.`);
  assert.ok(sql.length > 1000, 'Li quase nada das migrações — a leitura quebrou.');

  const descobertas = modelos.filter(modelo => !ligaRls(sql, modelo));

  assert.deepEqual(
    descobertas,
    [],
    `Tabela sem RLS em nenhuma migração: ${descobertas.join(', ')}.\n`
    + 'Acrescente na MESMA migração que cria a tabela:\n'
    + `    ALTER TABLE "${descobertas[0] ?? 'NomeDaTabela'}" ENABLE ROW LEVEL SECURITY;\n`
    + 'O Prisma não faz isso sozinho, e o Supabase só avisa depois que a tabela já está em produção.',
  );
});

test('o teste morde: uma tabela inventada seria reprovada', () => {
  // Sem isto, um erro na leitura das migrações deixaria o teste acima passando
  // sempre — que é justamente o tipo de falso "verde" que deixou a
  // OfficialPartIndex chegar à produção sem RLS.
  const sql = lerMigracoes();
  assert.equal(ligaRls(sql, 'TabelaQueNaoExiste'), false);
  assert.equal(ligaRls(sql, 'OfficialPartIndex'), true, 'A correção da OfficialPartIndex sumiu das migrações.');
});
