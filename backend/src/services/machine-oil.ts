import { normalizeIdentifier } from '../utils/normalize';

/**
 * Qual óleo a loja vende para cada tipo de máquina.
 *
 * Regra do dono, com as palavras dele: *"vendemos oleo 20w50 para cortador,
 * oleo 2t para maquinas 2 tempos, oleo corrente para motosserra/podador e por
 * ai vai. O oleo 15w40 não vendemos por conta que o 15w50 é melhor (oleo
 * recomendado pra motor de trator/giro zero e cambio)"*.
 *
 * **Não é catálogo, é consumível.** Óleo não tem código cadastrado aqui, então
 * não dá para resolver no catálogo como a junta do carburador. Entra no
 * orçamento como linha avulsa (prefixo `SRV-`), que a cesta já sabe tratar e
 * que aparece como "SERVIÇO / AVULSO" em vez de código.
 *
 * **Quando não dá para afirmar a família, oferece as opções.** Recomendar
 * 20W50 num motor 2 tempos estraga o motor do cliente — é erro pior que não
 * sugerir nada. Família desconhecida mostra os quatro botões e o atendente
 * escolhe, que foi o desenho que o dono pediu.
 */

export type OilKind = 'TWO_STROKE' | 'CHAIN' | 'MOWER_20W50' | 'TRACTOR_15W50';

export type ConsumableSuggestion = {
  kind: OilKind;
  /** Rótulo do botão, como o balcão fala. */
  label: string;
  /** Código de linha avulsa. A cesta trata `SRV-` como serviço/avulso. */
  code: string;
};

const OLEOS: Record<OilKind, ConsumableSuggestion> = {
  TWO_STROKE: { kind: 'TWO_STROKE', label: 'Óleo 2 tempos', code: 'SRV-OLEO-2T' },
  CHAIN: { kind: 'CHAIN', label: 'Óleo de corrente', code: 'SRV-OLEO-CORRENTE' },
  MOWER_20W50: { kind: 'MOWER_20W50', label: 'Óleo 20W50', code: 'SRV-OLEO-20W50' },
  TRACTOR_15W50: { kind: 'TRACTOR_15W50', label: 'Óleo 15W50', code: 'SRV-OLEO-15W50' },
};

/**
 * Família da máquina para efeito de óleo.
 *
 * `UNKNOWN` é resposta legítima e frequente — não force.
 */
export type MachineOilFamily =
  /** Roçadeira, soprador, cortador de cerca viva: 2 tempos. */
  | 'TWO_STROKE'
  /** Motosserra e podador: 2 tempos **e** óleo de corrente. */
  | 'CHAINSAW'
  /** Cortador de grama. */
  | 'MOWER'
  /** Trator e giro zero: motor e câmbio. */
  | 'TRACTOR'
  | 'UNKNOWN';

/**
 * Classifica pelo modelo da Husqvarna.
 *
 * A ordem importa: os prefixos de 4 tempos são testados **primeiro** porque
 * `LC121P` termina em `P` e não é podador — é cortador. Olhar o sufixo antes
 * do prefixo mandaria óleo de corrente para um cortador de grama.
 */
export function machineOilFamily(model: string | null | undefined): MachineOilFamily {
  const m = normalizeIdentifier(model || '');
  if (!m) return 'UNKNOWN';

  // Trator, giro zero e **Rider**.
  //
  // O Rider (`R112C`, `V548`, `V554`) é o cortador em que o operador senta, e
  // entra aqui e não em MOWER: ele tem câmbio, e a regra do dono para 15W50 é
  // "motor de trator/giro zero e cambio". Confirmado por ele em 2026-09-19 —
  // a primeira versão mandava 20W50 no `R112C` e deixava `V548`/`V554` como
  // desconhecidos, que foi o que a medição pegou.
  if (/^(?:TS|LT|YTH|TC|Z|MZ|V\d|R\d{3})/.test(m)) return 'TRACTOR';
  // Cortador de grama de empurrar.
  if (/^(?:LC|LB|HU|J\d|P\d{3})/.test(m)) return 'MOWER';
  // Roçadeira: dígitos e um R (143R, 236R, 541RS, 128R).
  if (/^\d{2,3}R/.test(m)) return 'TWO_STROKE';
  // Podador de haste: dígitos e P (525P, 327P) — depois dos prefixos acima.
  if (/^\d{3}P/.test(m)) return 'CHAINSAW';
  // Motosserra: só dígitos, com ou sem XP (236, 450, 272XP, 372XP).
  if (/^\d{3}(?:XP|E|G)?$/.test(m)) return 'CHAINSAW';
  // Soprador (125B, 525BX) e cortador de cerca viva (122HD).
  if (/^\d{3}(?:B|HD)/.test(m)) return 'TWO_STROKE';

  return 'UNKNOWN';
}

/**
 * Os óleos a oferecer para esta máquina.
 *
 * Família conhecida devolve só o que serve; desconhecida devolve todos, para o
 * atendente escolher em vez de eu chutar.
 */
export function oilSuggestions(model: string | null | undefined): ConsumableSuggestion[] {
  switch (machineOilFamily(model)) {
    case 'TWO_STROKE':
      return [OLEOS.TWO_STROKE];
    case 'CHAINSAW':
      // Motosserra e podador levam os dois: a mistura do motor e o da corrente.
      return [OLEOS.TWO_STROKE, OLEOS.CHAIN];
    case 'MOWER':
      return [OLEOS.MOWER_20W50];
    case 'TRACTOR':
      // 15W50 e não 15W40: decisão do dono, serve motor e câmbio.
      return [OLEOS.TRACTOR_15W50];
    default:
      return [OLEOS.TWO_STROKE, OLEOS.CHAIN, OLEOS.MOWER_20W50, OLEOS.TRACTOR_15W50];
  }
}
