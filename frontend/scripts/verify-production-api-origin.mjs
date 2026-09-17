import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DIST_DIR = new URL('../dist/', import.meta.url);
const FORBIDDEN_ORIGINS = ['https://cognivault-api.onrender.com'];

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(dir.pathname, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(new URL(`file://${path}/`)));
    else files.push(path);
  }

  return files;
}

const files = (await collectFiles(DIST_DIR)).filter(path => /\.(?:js|html|css)$/i.test(path));
if (files.length === 0) {
  console.error('Nenhum artefato de produção encontrado em dist/. Rode o build antes desta verificação.');
  process.exit(1);
}

const offenders = [];
for (const file of files) {
  const content = await readFile(file, 'utf8');
  for (const origin of FORBIDDEN_ORIGINS) {
    if (content.includes(origin)) offenders.push({ file: relative(DIST_DIR.pathname, file), origin });
  }
}

if (offenders.length > 0) {
  console.error('O bundle de produção contém origem direta do backend. A autenticação HttpOnly deve usar same-origin via Vercel rewrite.');
  for (const offender of offenders) console.error(`- ${offender.file}: ${offender.origin}`);
  process.exit(1);
}

console.log('Bundle de produção validado: API permanece same-origin.');
