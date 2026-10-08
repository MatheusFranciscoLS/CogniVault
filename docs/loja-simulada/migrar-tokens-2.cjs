// 2ª passada da migração para os tokens do tema:
//  - cv-surface / cv-field / cv-secondary / cv-primary / cv-touch-target viram utilitários do tema (somem os CSS de remendo);
//  - verde / amarelo / vermelho soltos (emerald, amber, rose) viram ok / warn / destructive, que já mudam sozinhos no tema escuro,
//    então as variantes dark: desses pares saem.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/migrar-tokens-2.cjs [--escrever]
const fs = require('fs');
const path = require('path');
const escrever = process.argv.includes('--escrever');

const CV = {
  'cv-surface': 'rounded-xl border border-border bg-card',
  'cv-field': 'h-10 rounded-md border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/60',
  'cv-secondary': 'inline-flex items-center justify-center gap-2 rounded-md border border-input bg-card font-semibold text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-60',
  'cv-primary': 'inline-flex items-center justify-center gap-2 rounded-md bg-primary font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-60',
  'cv-touch-target': 'min-h-10 min-w-10',
};

const COLOR = { emerald: 'ok', amber: 'warn', rose: 'destructive', red: 'destructive' };

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p) && !/\.test\./.test(p)) out.push(p);
  }
  return out;
}

function trocarClasseCor(cls) {
  // cls: "bg-emerald-50/70", "text-rose-700", "border-amber-200", "dark:bg-emerald-900/20" ...
  const m = /^(dark:)?(hover:)?(bg|text|border|ring|divide)-(emerald|amber|rose|red)-(\d+)(?:\/(\d+))?$/.exec(cls);
  if (!m) return cls;
  const [, dark, hover, kind, color, shade, alpha] = m;
  if (dark) return ''; // os tokens ok/warn/destructive já têm a versão escura
  const token = COLOR[color];
  const n = Number(shade);
  const pre = hover || '';
  if (kind === 'text') return `${pre}text-${token}`;
  if (kind === 'bg') {
    if (n <= 200) return `${pre}bg-${token === 'destructive' ? 'destructive/10' : `${token}-soft`}`;
    return `${pre}bg-${token}`; // 300+ (barra, bolinha): cor cheia
  }
  if (kind === 'border' || kind === 'ring' || kind === 'divide') return `${pre}${kind}-${token}/40`;
  return cls;
}

let total = 0;
const porArquivo = [];
for (const file of walk('src')) {
  let s = fs.readFileSync(file, 'utf8');
  const crlf = s.includes('\r\n');
  s = s.replace(/\r\n/g, '\n');
  const original = s;
  let n = 0;

  // 1) classes cv-*
  s = s.replace(/(className=(?:"[^"]*"|\{`[^`]*`\}))/g, attr => {
    if (!/\bcv-(surface|field|secondary|primary|touch-target)\b/.test(attr)) return attr;
    let out = attr;
    const hasSurface = /\bcv-surface\b/.test(out);
    if (hasSurface) out = out.replace(/\brounded-\[\d+px\] ?/g, '').replace(/\brounded-(xl|2xl|3xl|lg) +(?=[^"`]*cv-surface)/g, '');
    for (const [k, v] of Object.entries(CV)) out = out.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
    n++;
    return out;
  });

  // 2) cores soltas dentro de className
  // Troca só a classe; quando ela some (variante dark:), leva junto UM espaço, sem mexer na indentação do resto.
  s = s.replace(/className=("[^"]*"|\{`[^`]*`\})/g, (attr) => attr.replace(/([ ]?)(?<![\w-])((?:dark:)?(?:hover:)?(?:bg|text|border|ring|divide)-(?:emerald|amber|rose|red)-\d+(?:\/\d+)?)(?![\w-])/g, (m0, space, cls) => {
    const r = trocarClasseCor(cls);
    if (r === cls) return m0;
    n++;
    return r === '' ? '' : space + r;
  }).replace(/(["`]) +/g, '$1').replace(/ +(["`])/g, '$1'));

  if (s !== original) {
    porArquivo.push([file, n]);
    total += n;
    if (escrever) fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  }
}
porArquivo.sort((x, y) => y[1] - x[1]).forEach(([f, n]) => console.log(String(n).padStart(4), f));
console.log(escrever ? `gravado: ${total} trocas` : `só leitura: ${total} trocas (use --escrever)`);
