// Características da máquina para o orçamento, tiradas da DESCRIÇÃO da própria lista de preços da Husqvarna
// (`descricao_detalhada`), que o importador guarda como linhas de texto. Foi o que o dono esperava do "complemento":
// "não era pra você já puxar automático de acordo com a lista de preço?" (2026-10-07).
//
// A descrição é escrita para vitrine: título repetido, parágrafos de propaganda, avisos ("ATENÇÃO! Não inclui bateria"),
// emojis e linhas em caixa-alta. Daqui sai só o que serve de item numa lista curta: linhas curtas que não são frase, sem
// emoji, sem repetir o nome da máquina. O atendente vê exatamente essas linhas no diálogo e marca ou desmarca cada uma,
// então nada entra no PDF sem ele ver.
const MAX_LINE = 95;
export const MAX_BULLETS = 10;
/** Quantas vêm marcadas de saída; o resto o atendente liga se quiser. */
export const DEFAULT_BULLETS = 6;

const upperKey = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Aviso, cabeçalho ou propaganda: não é característica da máquina. */
const NOT_A_FEATURE = /aten[çc][ãa]o|n[ãa]o inclui|especifica[çc][õo]es|principais caracter[ií]sticas|imagem ilustrativa|garantia|observa[çc][ãa]o|importante/i;

function sentenceCase(line: string): string {
  const letters = line.replace(/[^A-Za-zÀ-ú]/g, '');
  if (letters.length < 6) return line;
  const upper = letters.replace(/[^A-ZÀ-Ú]/g, '').length;
  if (upper / letters.length < 0.8) return line;
  // Sigla com número (Z400, BLi10, 3/8") mantém a caixa original; o resto vira minúscula.
  const lower = line.split(' ').map(token => (/\d/.test(token) ? token : token.toLowerCase())).join(' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function listBullets(details: string | null | undefined, model: string, category = ''): string[] {
  if (!details) return [];
  const modelKey = upperKey(model);
  const categoryKey = upperKey(category);
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of details.split('\n')) {
    // tira emoji e símbolo do começo ("🔹 Cabeçote", "✔️ Bateria"), mantendo aspas e parêntese que abrem medida
    const line = raw.replace(/^[^\p{L}\p{N}"'(]+/u, '').replace(/\s+/g, ' ').trim();
    if (line.length < 3) continue;
    if (NOT_A_FEATURE.test(line)) continue;
    if (line.endsWith(':')) continue; // cabeçalho de lista ("INCLUI:")
    if (line.length > MAX_LINE || /[.!]$/.test(line)) continue; // frase de propaganda
    const key = upperKey(line);
    // título repetido: "MOTOSSERRA 272XP", "Automower® 440iQ", "PULVERIZADOR 318iS20"
    if (key.includes(modelKey) && key.length <= modelKey.length + categoryKey.length + 6 && !line.includes(':')) continue;
    if (key === categoryKey || key === modelKey) continue;
    const text = sentenceCase(line);
    const dedupe = upperKey(text);
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(text);
    if (out.length >= MAX_BULLETS) break;
  }
  return out;
}

/** Título da lista no PDF: na roçadeira é o "conjunto" do modelo em Word da loja; nas outras, "Características". */
export function bulletsHeading(category: string): string {
  return upperKey(category).startsWith('ROCADEIRA') ? 'Conjunto da roçadeira é composto por:' : 'Características:';
}
