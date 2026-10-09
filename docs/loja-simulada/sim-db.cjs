// Loja simulada, parte 1: Postgres descartável com as MIGRAÇÕES REAIS aplicadas em ordem.
// Só o que depende de pgvector é trocado (coluna vira texto; índices vetoriais saem).
// NUNCA toca a produção: o banco é local, na porta 54330.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PG = 'C:/Program Files/PostgreSQL/18/bin';
const TMP = path.join(process.env.LOCALAPPDATA, 'Temp', 'cvsim');
const DATA = path.join(TMP, 'data');
const PORT = '54330';
const REPO = path.resolve(__dirname, '..', '..');
const env = { ...process.env, PGPASSWORD: 'sim' };

const run = (bin, args, opts = {}) => execFileSync(path.join(PG, bin), args, { env, encoding: 'utf8', ...opts });
const psql = (args, opts) => run('psql.exe', ['-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', ...args], opts);

const cmd = process.argv[2];

if (cmd === 'up') {
  if (!fs.existsSync(path.join(DATA, 'PG_VERSION'))) {
    fs.mkdirSync(TMP, { recursive: true });
    fs.writeFileSync(path.join(TMP, 'pw.txt'), 'sim');
    run('initdb.exe', ['-D', DATA, '-U', 'postgres', '--pwfile=' + path.join(TMP, 'pw.txt'), '-E', 'UTF8', '--locale=C']);
    console.log('initdb ok');
  }
  try { run('pg_ctl.exe', ['-D', DATA, '-l', path.join(TMP, 'server.log'), '-o', `-p ${PORT}`, '-w', 'start']); console.log('postgres no ar na porta', PORT); }
  catch (e) { console.log('já estava rodando ou falhou:', String(e.message).slice(0, 200)); }
}

if (cmd === 'migrate') {
  // O migrate APAGA o schema inteiro (usuários, catálogo, preços). Recusa quando a simulação já tem dados, a menos que se peça com --force
  // (o `sim-reconstruir.ps1` pede, e depois recarrega tudo). Foi assim que a simulação foi zerada sem querer em 2026-10-09.
  if (!process.argv.includes('--force')) {
    let tenants = 0;
    try { tenants = Number(psql(['-t', '-A', '-c', 'SELECT count(*) FROM "Tenant"']).trim()) || 0; } catch { tenants = 0; }
    if (tenants > 0) {
      console.log('RECUSADO: a loja simulada já tem dados e o migrate apaga tudo. Para aplicar só uma migração nova use o psql no arquivo dela; para recriar tudo rode docs/loja-simulada/sim-reconstruir.ps1 (ou repita com --force e refaça o passo 2 do README).');
      process.exit(2);
    }
  }
  const dir = path.join(REPO, 'backend/prisma/migrations');
  const folders = fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory()).sort();
  psql(['-c', 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;']);
  // Substitutos do que o Supabase e o `prisma migrate` fornecem na produção.
  psql(['-c', `CREATE TABLE IF NOT EXISTS public._prisma_migrations (id text PRIMARY KEY); DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $$;`]);
  let applied = 0;
  for (const folder of folders) {
    let sql = fs.readFileSync(path.join(dir, folder, 'migration.sql'), 'utf8');
    sql = sql
      .replace(/CREATE EXTENSION IF NOT EXISTS "?vector"?;?/gi, '')
      .replace(/CREATE INDEX[^;]*USING hnsw[^;]*;/gi, '')
      .replace(/vector\(\d+\)/gi, 'text')
      .replace(/ENABLE ROW LEVEL SECURITY/gi, 'ENABLE ROW LEVEL SECURITY'); // mantém
    const file = path.join(TMP, 'm.sql');
    fs.writeFileSync(file, sql);
    try { psql(['-f', file]); applied += 1; }
    catch (e) { console.log('FALHOU em', folder, '\n', String(e.stderr || e.message).slice(0, 600)); process.exit(1); }
  }
  console.log(`migrações aplicadas: ${applied}/${folders.length}`);
}

if (cmd === 'down') {
  try { run('pg_ctl.exe', ['-D', DATA, 'stop', '-m', 'fast']); console.log('postgres parado'); } catch (e) { console.log(String(e.message).slice(0, 200)); }
}
