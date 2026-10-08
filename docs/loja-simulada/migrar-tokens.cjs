// Migra pares "claro + dark:" da paleta antiga (ink-*) para os tokens do tema (shadcn): text-foreground, text-muted-foreground,
// bg-card, bg-muted, border-border. Só troca o par quando os dois lados casam com a tabela; o resto fica para revisão manual.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/migrar-tokens.cjs [--escrever]
const fs = require('fs');
const path = require('path');

const escrever = process.argv.includes('--escrever');

// [tipo, claro, escuro] -> token
const light = (kind, shades) => shades.map(s => [kind, s]);
const RULES = [];
const add = (kind, lights, darks, token) => { for (const l of lights) for (const d of darks) RULES.push({ kind, l, d, token }); };
add('text', ['ink-950', 'ink-900', 'ink-800', 'ink-700'], ['white', 'ink-50', 'ink-100', 'ink-200'], 'text-foreground');
add('text', ['ink-600', 'ink-500'], ['ink-300', 'ink-400'], 'text-muted-foreground');
add('bg', ['white'], ['ink-950', 'ink-900', 'ink-850', 'ink-800'], 'bg-card');
add('bg', ['ink-50', 'ink-100'], ['ink-950', 'ink-900', 'ink-850', 'ink-800'], 'bg-muted');
add('border', ['ink-100', 'ink-200', 'ink-300'], ['ink-700', 'ink-800'], 'border-border');

const lookup = new Map(RULES.map(r => [`${r.kind}|${r.l}|${r.d}`, r.token]));
const re = /(?<![\w:-])(text|bg|border)-(ink-\d+|white)(?:\/\d+)?(\s+)dark:\1-(ink-\d+|white)(?:\/\d+)?(?![\w-])/g;
const reRev = /(?<![\w:-])dark:(text|bg|border)-(ink-\d+|white)(?:\/\d+)?(\s+)\1-(ink-\d+|white)(?:\/\d+)?(?![\w-])/g;

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p) && !/\.test\./.test(p)) out.push(p);
  }
  return out;
}

let total = 0;
const porArquivo = [];
for (const file of walk('src')) {
  let s = fs.readFileSync(file, 'utf8');
  const crlf = s.includes('\r\n');
  s = s.replace(/\r\n/g, '\n');
  let n = 0;
  const trocar = (m, kind, a, space, b, claroPrimeiro) => {
    const token = claroPrimeiro ? lookup.get(`${kind}|${a}|${b}`) : lookup.get(`${kind}|${b}|${a}`);
    if (!token) return m;
    n++;
    return token;
  };
  s = s.replace(re, (m, kind, a, space, b) => trocar(m, kind, a, space, b, true));
  s = s.replace(reRev, (m, kind, a, space, b) => trocar(m, kind, a, space, b, false));
  if (n) {
    porArquivo.push([file, n]);
    total += n;
    if (escrever) fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  }
}
porArquivo.sort((x, y) => y[1] - x[1]).forEach(([f, n]) => console.log(String(n).padStart(4), f));
console.log(escrever ? `gravado: ${total} pares` : `só leitura: ${total} pares (use --escrever)`);
