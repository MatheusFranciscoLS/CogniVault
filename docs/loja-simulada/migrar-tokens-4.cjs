// 4ª passada: pares claro+dark: adjacentes com variante (hover:, opacidade) que as passadas 1-3 deixaram.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/migrar-tokens-4.cjs [--escrever]
const fs = require('fs');
const path = require('path');
const escrever = process.argv.includes('--escrever');
const D = '\d+';
const RULES = [
  [new RegExp(`(?<![\w:-])bg-brand-50(?:/${D})? dark:bg-ink-(?:950|900|850|800)(?:/${D})?(?![\w-])`, 'g'), 'bg-selected'],
  [new RegExp(`(?<![\w:-])bg-ink-(?:50|100)(?:/${D})? dark:bg-ink-(?:900|850|800|700)(?:/${D})?(?![\w-])`, 'g'), 'bg-muted'],
  [new RegExp(`(?<![\w-])hover:bg-ink-(?:50|100)(?:/${D})? dark:hover:bg-ink-(?:900|850|800|700)(?:/${D})?(?![\w-])`, 'g'), 'hover:bg-accent'],
  [new RegExp(`(?<![\w:-])text-ink-(?:950|900|800|700) dark:text-ink-(?:50|100|200|300)(?![\w-])`, 'g'), 'text-foreground'],
  [new RegExp(`(?<![\w:-])border-ink-(?:200|300) dark:border-ink-(?:600|700|800)(?![\w-])`, 'g'), 'border-input'],
  [new RegExp(`(?<![\w-])hover:border-ink-(?:300|400) dark:hover:border-ink-(?:500|600|700)(?![\w-])`, 'g'), 'hover:border-input'],
];
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p) && !/\.test\./.test(p)) out.push(p);
  }
  return out;
}
let total = 0; const rows = [];
for (const file of walk('src')) {
  let s = fs.readFileSync(file, 'utf8'); const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
  let n = 0;
  for (const [re, token] of RULES) s = s.replace(re, () => { n++; return token; });
  if (n) { rows.push([file, n]); total += n; if (escrever) fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s); }
}
rows.sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(String(n).padStart(4), f));
console.log(escrever ? `gravado: ${total}` : `só leitura: ${total} (use --escrever)`);
