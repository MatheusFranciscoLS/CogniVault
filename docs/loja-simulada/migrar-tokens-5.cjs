// 5ª passada: restos soltos (divide, abas, avisos dourados, botões de erro) viram token do tema.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/migrar-tokens-5.cjs [--escrever]
const fs = require('fs');
const path = require('path');
const escrever = process.argv.includes('--escrever');
const W = '(?<![\w:-])', E = '(?![\w-])';
const R = (src, flags = 'g') => new RegExp(src, flags);
const RULES = [
  [R(`${W}divide-ink-100(?: dark:divide-ink-(?:800|700))?${E}`), 'divide-border'],
  [R(`${W}bg-ink-200(?:/\d+)? dark:bg-ink-800(?:/\d+)?${E}`), 'bg-muted'],
  [R(`${W}bg-gold-100 p-3 dark:bg-gold-500/10${E}`), 'bg-warn-soft p-3'],
  [R(`${W}border-gold-500/40${E}`), 'border-warn/40'],
  [R(`${W}text-gold-800 dark:text-gold-300${E}`), 'text-warn'],
  [R(`${W}bg-gold-100 px-1\.5 py-0\.5 text-sm font-bold text-gold-800 dark:bg-gold-500/15 dark:text-gold-300${E}`), 'bg-warn-soft px-1.5 py-0.5 text-sm font-bold text-warn'],
  [R(`${W}text-accent-700 dark:text-accent-300${E}`), 'text-destructive'],
  [R(`${W}bg-ink-900 (px-[\w.]+ (?:py-[\w.]+ )?text-\w+ font-black) text-white transition hover:bg-ink-950`), 'bg-primary $1 text-primary-foreground transition hover:bg-primary-hover'],
  [R(`${W}bg-ink-900 (px-[\w.]+ text-sm font-black) text-white transition hover:bg-ink-950`), 'bg-primary $1 text-primary-foreground transition hover:bg-primary-hover'],
  [R(`${W}hover:text-ink-900 dark:hover:text-ink-\d+${E}`), 'hover:text-foreground'],
  [R(`${W}hover:text-ink-800 dark:hover:text-ink-\d+${E}`), 'hover:text-foreground'],
  [R(`${W}hover:text-ink-700${E}`), 'hover:text-foreground'],
  [R(`${W}text-ink-500${E}`), 'text-muted-foreground'],
  [R(`${W}hover:bg-ink-50(?:/\d+)?(?: dark:hover:bg-ink-\d+(?:/\d+)?)?${E}`), 'hover:bg-accent'],
];
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p) && !/\.test\./.test(p) && !/QuickQuoteCart/.test(p)) out.push(p);
  }
  return out;
}
let total = 0; const rows = [];
for (const file of walk('src')) {
  let s = fs.readFileSync(file, 'utf8'); const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
  let n = 0;
  for (const [re, token] of RULES) s = s.replace(re, (...a) => { n++; return token.replace(/\$(\d)/g, (_, i) => a[+i]); });
  if (n) { rows.push([file, n]); total += n; if (escrever) fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s); }
}
rows.sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(String(n).padStart(4), f));
console.log(escrever ? `gravado: ${total}` : `só leitura: ${total} (use --escrever)`);
