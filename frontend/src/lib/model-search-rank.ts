// Ordem dos resultados quando o atendente pesquisa um MODELO de máquina ("122 HD60").
//
// O Portal devolve o que acha em ordem alfabética dentro de cada tipo, então "522HD60S" vinha antes da máquina pedida,
// e o título dela ("HUSQVARNA Aparador de Cerca Viva Husqvarna 122 HD60") era cortado antes de chegar ao modelo. Regra do
// dono (2026-10-07): primeiro o modelo pesquisado, depois os parecidos, depois o resto.
//
//   0  o título cita o modelo inteiro (sem número ou letra colado): "IPL, 122 HD60, 2016-05"
//   1  o título contém o modelo dentro de outro nome: "122HD60S", "122HD60X"
//   2  o resto (a busca do Portal é larga: traz 522HD60S para "122 HD60")
export type ModelTier = 0 | 1 | 2;

const upperKey = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function modelMatchTier(title: string, term: string): ModelTier {
  const key = upperKey(term).slice(0, 40);
  if (key.length < 3) return 2;
  const text = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().slice(0, 300);
  const pattern = [...key].join('[\\s\\-./]*');
  if (new RegExp(`(?<![A-Z0-9])${pattern}(?![A-Z0-9])`).test(text)) return 0;
  return upperKey(title).includes(key) ? 1 : 2;
}

/**
 * O modelo que o atendente DIGITOU. O servidor anuncia só o pedaço com cara de modelo ("HD60" para "122 HD60", porque
 * "122" sozinho é número), e ordenar por "HD60" põe "123 HD60" e "122 HD60" no mesmo grau. Aqui o número solto volta a se juntar
 * ao token do lado ("122" + "HD60" = "122HD60"). Sem texto digitado que contenha o que o servidor anunciou, vale o anunciado.
 */
export function searchModelTerm(typed: string, announced: string): string {
  const base = upperKey(announced);
  if (!base) return '';
  const tokens = typed.split(/\s+/).filter(Boolean);
  for (let index = 0; index < tokens.length; index += 1) {
    const key = upperKey(tokens[index]);
    if (key.length < 3 || !key.includes(base) || !/\d/.test(key)) continue;
    // Número solto logo antes ("122" + "HD60") faz parte do modelo; palavra comum ("aparador") não.
    const before = index > 0 && /^\d{1,4}$/.test(tokens[index - 1]) ? upperKey(tokens[index - 1]) : '';
    return `${before}${key}`;
  }
  return announced;
}

/** Ordena por proximidade com o modelo pesquisado; dentro do mesmo grau mantém a ordem que veio (estável). */
export function rankByModel<T extends { title: string }>(items: readonly T[], term: string): T[] {
  return items
    .map((item, index) => ({ item, index, tier: modelMatchTier(item.title, term) }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map(entry => entry.item);
}

/**
 * Rótulo curto da ficha de máquina: o MODELO primeiro, porque é ele que o atendente procura. O Portal escreve
 * "HUSQVARNA Aparador de Cerca Viva Husqvarna 122 HD60 (sem bateria e carregador)"; o chip mostra "122 HD60" e, ao
 * lado, "Aparador de Cerca Viva".
 */
export function machineChipLabel(title: string): { model: string; kind: string | null } {
  const clean = title.replace(/\([^)]{0,80}\)/g, ' ').replace(/[®™]/g, '').replace(/\s+/g, ' ').trim();
  const split = /^(?:HUSQVARNA\s+)?(.*?)\s*\bHusqvarna\s+(.+)$/i.exec(clean);
  if (split && split[2]) {
    // "a bateria 240i": as palavras antes do primeiro token com número descrevem a máquina; o modelo começa no número
    // (ou na sigla de 1 a 3 letras colada nele, como em "K 540i").
    const tokens = split[2].trim().split(' ');
    let start = tokens.findIndex(token => /\d/.test(token));
    if (start > 0 && /^[A-Z]{1,3}$/.test(tokens[start - 1])) start -= 1;
    if (start > 0) {
      return { model: tokens.slice(start).join(' '), kind: [split[1]?.trim(), tokens.slice(0, start).join(' ')].filter(Boolean).join(' ') || null };
    }
    return { model: split[2].trim(), kind: split[1]?.trim() || null };
  }
  return { model: clean.replace(/^HUSQVARNA\s+/i, '').trim() || clean, kind: null };
}
