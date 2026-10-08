// 3ª passada: pares claro + dark: NÃO adjacentes (dentro do mesmo className) viram token do tema.
// Ex.: "border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-850" -> "border-border bg-card".
// Uso (de dentro de frontend/): node ../docs/loja-simulada/migrar-tokens-3.cjs [--escrever]
const fs = require('fs');
const path = require('path');
const escrever = process.argv.includes('--escrever');

const RULES = new Map();
const add = (kind, lights, darks, token) => { for (const l of lights) for (const d of darks) RULES.set(`${kind}|${l}|${d}`, token); };
add('text', ['ink-950', 'ink-900', 'ink-800', 'ink-700'], ['white', 'ink-50', 'ink-100', 'ink-200'], 'text-foreground');
add('text', ['ink-600', 'ink-500'], ['ink-300', 'ink-400'], 'text-muted-foreground');
add('bg', ['white'], ['ink-950', 'ink-900', 'ink-850', 'ink-800'], 'bg-card');
add('bg', ['ink-50', 'ink-100'], ['ink-950', 'ink-900', 'ink-850', 'ink-800'], 'bg-muted');
add('border', ['ink-100', 'ink-200', 'ink-300'], ['ink-700', 'ink-800'], 'border-border');

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p) && !/\.test\./.test(p)) out.push(p);
  }
  return out;
}

const lightRe = /(?<![\w:-])(text|bg|border)-(ink-\d+|white)(?:\/\d+)?(?![\w-])/g;
const darkRe = /(?<![\w-])dark:(text|bg|border)-(ink-\d+|white)(?:\/\d+)?(?![\w-])/g;

let total = 0;
const rows = [];
for (const file of walk('src')) {
  let s = fs.readFileSync(file, 'utf8');
  const crlf = s.includes('\r\n');
  s = s.replace(/\r\n/g, '\n');
  let n = 0;
  s = s.replace(/className=("[^"]*"|\{`[^`]*`\})/g, attr => {
    if (!/dark:(text|bg|border)-/.test(attr)) return attr;
    let out = attr;
    for (const kind of ['text', 'bg', 'border']) {
      const lights = [...out.matchAll(new RegExp(lightRe.source, 'g'))].filter(m => m[1] === kind);
      const darks = [...out.matchAll(new RegExp(darkRe.source, 'g'))].filter(m => m[1] === kind);
      if (lights.length !== 1 || darks.length !== 1) continue; // ambíguo: deixa para revisão manual
      const token = RULES.get(`${kind}|${lights[0][2]}|${darks[0][2]}`);
      if (!token) continue;
      // troca a claro pelo token e apaga a dark: (e um espaço junto)
      out = out.replace(darks[0][0] + ' ', '').replace(' ' + darks[0][0], '').replace(darks[0][0], '');
      out = out.replace(lights[0][0], token);
      n++;
    }
    return out;
  });
  if (n) { rows.push([file, n]); total += n; if (escrever) fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s); }
}
rows.sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(String(n).padStart(4), f));
console.log(escrever ? `gravado: ${total} pares` : `só leitura: ${total} pares (use --escrever)`);
