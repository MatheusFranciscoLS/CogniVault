/**
 * Decide se uma busca do balcão também vale uma consulta de MÁQUINA.
 *
 * Existe porque o atendimento e as máquinas viraram uma tela só: o atendente
 * escreve num campo e o sistema oferece as duas coisas. Só que consultar
 * máquina custa uma chamada externa ao Portal Husqvarna, e o cache dela é LRU
 * em memória (perde no restart do Render free). Disparar em toda busca de peça
 * pagaria esse custo em "carburador", "junta", "filtro de ar" — consultas onde
 * nunca existe máquina para achar.
 *
 * Então a regra é: só gasta a consulta quando o texto carrega um identificador
 * de máquina. E ela é de propósito conservadora nos dois casos abaixo, porque
 * errar para o lado do falso positivo é o que envenena a tela do balcão com
 * máquina que não tem nada a ver com a peça pedida.
 */

export type MachineQueryHint = {
  /**
   * Motor Kawasaki, quando o texto traz **série + spec** (`FX921V-ES06`).
   *
   * Só essa forma completa é aceita, e o motivo é medido: a série sozinha
   * (`FS730V`, `FR691V`) casa o mesmo padrão de modelos Husqvarna como
   * `LC121P` e `LB155S`, e no catálogo da Kawasaki ela devolve até 10 specs
   * diferentes — cada um com peças próprias. Série+spec é o que está na
   * plaqueta do motor e não colide com nada.
   */
  kawasakiModel: string | null;
  /**
   * PNC da etiqueta, quando o atendente digitou com a máscara impressa.
   * Abre a máquina direto, sem passar pela busca.
   */
  pnc: string | null;
  /**
   * Um único termo de modelo para a busca oficial. Um, não vários: cada termo
   * é uma chamada externa, e a consulta do balcão raramente nomeia duas
   * máquinas.
   */
  model: string | null;
};

const EMPTY: MachineQueryHint = { pnc: null, model: null, kawasakiModel: null };

/**
 * Medida e unidade, não modelo. `2T`/`4T` (mistura), `10W30` (viscosidade),
 * `12V` (bateria), `50MM` (diâmetro) todos casam "tem letra e dígito" e
 * nenhum é máquina.
 */
const MEASUREMENT = /^\d+(?:[.,]\d+)?(?:T|V|W\d+|MM|CM|ML|MT|L|KG|G|CC|POL|HP|RPM|PSI)$/i;

/** Ruído de linguagem que casaria a forma de modelo sem ser um. */
const NOISE = new Set(['2T', '4T', 'PNC', 'REF', 'COD', 'N1', 'N2', 'Nº', 'NO']);

function tokens(query: string): string[] {
  return query
    .replace(/[  ]/g, ' ')
    .split(/[\s,;/]+/)
    .map(token => token.trim())
    .filter(Boolean);
}

/**
 * Um token com letra E dígito é a forma de todo modelo Husqvarna que o balcão
 * digita: `143RII`, `TS142`, `LC121P`, `Z460`, `572XP`, `HU725AWD`.
 *
 * O hífen é recusado de propósito. Ele é a assinatura de CÓDIGO, não de
 * máquina: `15004-0937` (Kawasaki), `104M02-0002-F1` (Briggs),
 * `530069247-01` (Husqvarna). Aceitá-lo faria toda consulta por código de peça
 * disparar uma busca de máquina que nunca acha nada.
 */
function looksLikeModel(token: string): boolean {
  const value = token.replace(/[.®]/g, '');
  if (value.length < 3 || value.length > 14) return false;
  if (!/^[A-Za-z0-9]+$/.test(value)) return false;
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return false;
  if (MEASUREMENT.test(value)) return false;
  if (NOISE.has(value.toUpperCase())) return false;
  return true;
}

/**
 * PNC da etiqueta exige DUAS coisas ao mesmo tempo: a máscara com espaço
 * (`967 17 65-01`) e o prefixo `9`.
 *
 * As duas juntas, porque cada uma sozinha erra:
 *
 * - **Só a máscara não basta.** Código de peça Husqvarna usa exatamente a mesma
 *   (`587 10 67-01`), e `looksLikeExactPartCode` já trata essa forma como
 *   código — é o formato impresso na embalagem. Sem o prefixo, o balcão pedindo
 *   uma peça pela máscara abriria a tela de máquina.
 * - **Só o prefixo não basta.** `967176501` colado é indistinguível de um código
 *   de peça de 9 dígitos, e código de peça é o que a loja digita o dia inteiro.
 *
 * O prefixo `9` é a mesma regra que `normalizeHusqvarnaPnc` já usa em produção
 * (`/^9\d{8}(\d{2})?$/`), não um palpite novo.
 *
 * Resta um caso que nenhuma regra de formato pega: uma peça começando com 9,
 * digitada com máscara. Ele não produz código errado — quem abre a máquina
 * confere `kind === 'PRODUCT_CATALOG'` e diz que a Husqvarna não confirmou
 * aquele PNC como máquina.
 */
function pncFromMask(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (!/^[\d\s-]+$/.test(trimmed)) return null;
  if (!/\d\s+\d/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  return /^9\d{8}(?:\d{2})?$/.test(digits) ? digits : null;
}

/**
 * Motor Kawasaki com série E spec, que é a forma da plaqueta.
 *
 * Aceita só a forma completa de propósito — ver o comentário de
 * `kawasakiModel` em `MachineQueryHint`.
 */
const KAWASAKI_WITH_SPEC = /^[A-Z]{2}\d{3,4}[A-Z]-[A-Z]{2}\d{2}$/;

function kawasakiFromTokens(value: string): string | null {
  for (const token of tokens(value)) {
    const limpo = token.replace(/[.®]/g, '').toUpperCase();
    if (KAWASAKI_WITH_SPEC.test(limpo)) return limpo;
  }
  return null;
}

export function machineQueryHint(query: string | null | undefined): MachineQueryHint {
  const value = (query ?? '').trim();
  if (value.length < 3) return EMPTY;

  const pnc = pncFromMask(value);
  if (pnc) return { ...EMPTY, pnc };

  // Kawasaki com spec é inequívoco, então vem antes: `FX921V-ES06` não é
  // máquina Husqvarna e buscar lá só gastaria chamada.
  const kawasakiModel = kawasakiFromTokens(value);
  if (kawasakiModel) return { ...EMPTY, kawasakiModel };

  const model = tokens(value).find(looksLikeModel) ?? null;
  return { ...EMPTY, model: model ? model.replace(/[.®]/g, '').toUpperCase() : null };
}

/** Verdadeiro quando vale gastar a consulta externa de máquina. */
export function wantsMachineLookup(query: string | null | undefined): boolean {
  const hint = machineQueryHint(query);
  return Boolean(hint.pnc || hint.model || hint.kawasakiModel);
}
