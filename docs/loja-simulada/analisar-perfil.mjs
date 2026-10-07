// Lê um .cpuprofile do Node e mostra onde o processo gastou CPU (tempo próprio por função e por arquivo).
// Uso: node docs/loja-simulada/analisar-perfil.mjs <arquivo.cpuprofile> [quantidade]
import fs from 'node:fs';

const perfil = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const quantidade = Number(process.argv[3] ?? 18);
const porId = new Map(perfil.nodes.map(n => [n.id, n]));
const proprio = new Map();
const dt = perfil.timeDeltas;
for (let i = 0; i < perfil.samples.length; i++) proprio.set(perfil.samples[i], (proprio.get(perfil.samples[i]) ?? 0) + (dt[i] ?? 0));

const porFuncao = new Map();
const porArquivo = new Map();
let total = 0;
for (const [id, micro] of proprio) {
  const n = porId.get(id);
  const { functionName, url, lineNumber } = n.callFrame;
  if (functionName === '(idle)' || functionName === '(program)') continue;
  total += micro;
  const arquivo = (url || '(nativo)').replace(/^.*[\\/]node_modules[\\/]/, 'node_modules/').replace(/^.*[\\/]backend[\\/]/, 'backend/').replace(/^file:\/\/\/.*backend\//, 'backend/');
  const chave = `${functionName || '(anônima)'}  ${arquivo}:${lineNumber + 1}`;
  porFuncao.set(chave, (porFuncao.get(chave) ?? 0) + micro);
  porArquivo.set(arquivo, (porArquivo.get(arquivo) ?? 0) + micro);
}
const ms = v => `${(v / 1000).toFixed(0)} ms`.padStart(9);
console.log(`CPU total (sem ocioso): ${(total / 1000).toFixed(0)} ms\n\nPor função (tempo próprio):`);
for (const [k, v] of [...porFuncao].sort((a, b) => b[1] - a[1]).slice(0, quantidade)) console.log(ms(v), k);
console.log('\nPor arquivo:');
for (const [k, v] of [...porArquivo].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(ms(v), k);
