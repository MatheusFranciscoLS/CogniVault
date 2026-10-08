/**
 * Lê o modelo de motor que o atendente digitou a partir da PLAQUETA e decide a marca pelo formato.
 *
 * Por que existe (dono, 2026-10-08): o cartão "Motor desta máquina" mostra o que as fontes sabem, e a plaqueta pode dizer outro motor
 * (o motor muda com o ano da máquina). Sem este campo, o atendente teria de fechar o painel e voltar para a busca.
 *
 * O reconhecimento é por FORMATO e é conservador: na dúvida devolve `unknown`, que vira uma mensagem dizendo o que digitar. Nunca
 * inventa uma marca. Aceita o que a mão escreve de verdade: caixa baixa, espaço no lugar do hífen, o código colado
 * (`FX921VHS04S`), ponto, ®.
 */

export type EngineBrandName = 'Kohler' | 'Kawasaki' | 'Briggs & Stratton' | 'Husqvarna';

export type EngineInput =
  | { kind: 'ok'; brand: EngineBrandName; model: string; precision: 'MODELO' | 'SERIE' }
  /** Kohler só com a série (SV540): o catálogo pede o spec completo, que está na plaqueta. */
  | { kind: 'needs-spec'; brand: 'Kohler'; series: string }
  | { kind: 'unknown' };

const UNKNOWN: EngineInput = { kind: 'unknown' };

/** Tira o que a plaqueta e a mão acrescentam sem querer, e junta separadores num só. */
function clean(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[®™.,;:()]/g, ' ')
    .replace(/[‐-―_/]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSingle(raw: string | null | undefined): EngineInput {
  const text = clean(String(raw ?? '')).slice(0, 40);
  if (text.length < 4) return UNKNOWN;
  const compact = text.replace(/[\s-]+/g, '');
  const parts = text.split(/[\s-]+/).filter(Boolean);

  // Kawasaki: série (FX921V) + spec de 2 letras e 2 dígitos (ES06), mais uma letra final que o catálogo não usa (FX921VHS04S).
  const kawasakiFull = /^(F[A-Z]\d{3,4}V)([A-Z]{2}\d{2})[A-Z]?$/.exec(compact);
  if (kawasakiFull) return { kind: 'ok', brand: 'Kawasaki', model: `${kawasakiFull[1]}-${kawasakiFull[2]}`, precision: 'MODELO' };
  const kawasakiSeries = /^(F[A-Z]\d{3,4}V)$/.exec(compact);
  if (kawasakiSeries) return { kind: 'ok', brand: 'Kawasaki', model: kawasakiSeries[1], precision: 'SERIE' };

  // Kohler: letras + número (+ letra) e 4 dígitos (SV540-3212). Começa por LETRAS: o Briggs começa por dígito.
  // Só as séries Kohler que a loja conhece: letras soltas + números também descrevem peças e outras marcas.
  const KOHLER = '(?:SV|CH|CV|KT|XT|CS|ECV|ECH|ZT|KD)';
  const kohlerSeriesPattern = new RegExp(`^${KOHLER}\\d{2,4}[A-Z]?$`);
  // Com separador (SV540-3212, SV540 3212) a fronteira é exata; colado (SV5403212) o regex recua até fechar série + 4 dígitos.
  if (parts.length === 2 && kohlerSeriesPattern.test(parts[0]) && /^\d{4}$/.test(parts[1])) {
    return { kind: 'ok', brand: 'Kohler', model: `${parts[0]}-${parts[1]}`, precision: 'MODELO' };
  }
  const kohlerGlued = new RegExp(`^(${KOHLER}\\d{2,4}[A-Z]?)(\\d{4})$`).exec(compact);
  if (kohlerGlued) return { kind: 'ok', brand: 'Kohler', model: `${kohlerGlued[1]}-${kohlerGlued[2]}`, precision: 'MODELO' };
  if (kohlerSeriesPattern.test(compact)) return { kind: 'needs-spec', brand: 'Kohler', series: compact };

  // Briggs: modelo de 6 caracteres COM LETRA, tipo de 4 e, às vezes, código de 1 a 2 (104M02-0002-F1). Modelo de 5 dígitos leva zero na frente.
  // Com separador a fronteira é a que o atendente escreveu; colado, só vale o desenho de 6 + 4 (+ 2) caracteres.
  const briggsBlocks = parts.length >= 2
    ? parts.slice(0, 3)
    : /^\d[0-9A-Z]{5}[0-9A-Z]{4}(?:[0-9A-Z]{2})?$/.test(compact) ? [compact.slice(0, 6), compact.slice(6, 10), compact.slice(10)].filter(Boolean) : [];
  if (briggsBlocks.length >= 2 && parts.length <= 3) {
    const [family, type, code] = briggsBlocks;
    if (/^\d[0-9A-Z]{4,5}$/.test(family) && /[A-Z]/.test(family) && /^[0-9A-Z]{4}$/.test(type) && (!code || /^[0-9A-Z]{1,2}$/.test(code))) {
      const padded = family.length === 5 ? `0${family}` : family;
      return { kind: 'ok', brand: 'Briggs & Stratton', model: [padded, type, code].filter(Boolean).join('-'), precision: 'MODELO' };
    }
  }

  // Motor Husqvarna próprio (HS452, HV764): sem catálogo próprio, a tela só busca as peças.
  const husqvarna = /^H[SV]\d{3,4}[A-Z]{0,2}$/.exec(compact);
  if (husqvarna) return { kind: 'ok', brand: 'Husqvarna', model: compact, precision: 'MODELO' };

  return UNKNOWN;
}

/**
 * A plaqueta da Briggs escreve MODELO, TIPO e CÓDIGO em campos separados ("MODEL 104M02 TYPE 0002 CODE F1"). Junta os três quando o texto traz as
 * palavras-chave, na ordem em que aparecem; sem elas, não adivinha.
 */
function parseBriggsPlate(words: string[]): EngineInput {
  const after = (keyword: string) => {
    const at = words.findIndex(word => word === keyword || word === `${keyword}:`);
    if (at < 0) return undefined;
    // "MODEL NO. 104M02", "TYPE NO. 0002-F1": pula o "NO" (ou Nº) que a plaqueta escreve entre o campo e o valor.
    const next = words[at + 1];
    return next === 'NO' || next === 'N°' || next === 'Nº' || next === '#' ? words[at + 2] : next;
  };
  const model = after('MODEL');
  const type = after('TYPE') ?? after('TIPO');
  const code = after('CODE') ?? after('CÓDIGO') ?? after('COD');
  if (!model || !type) return UNKNOWN;
  // O tipo pode vir já com o código ("0002-F1") e o código com o número de série ao lado: só vale o que cabe no formato.
  const joined = [model, type, code && /^[0-9A-Z]{1,2}$/.test(code) ? code : ''].filter(Boolean).join('-');
  const result = parseSingle(joined);
  return result.kind === 'ok' && result.brand === 'Briggs & Stratton' ? result : UNKNOWN;
}

/**
 * Lê o que o atendente digitou OU colou. Tenta o texto inteiro; se não for um modelo, procura um modelo dentro de linha maior ("Model No. FX921V-ES06",
 * "SV540 3212 Serial 3012345678") em janelas de 1 a 3 palavras, e por último a plaqueta da Briggs em três campos. Continua conservador: entre
 * palavras soltas só vale um formato inteiro e exato, então "carburador 587106701" nunca vira catálogo.
 */
export function parseEngineInput(raw: string | null | undefined): EngineInput {
  const whole = parseSingle(raw);
  if (whole.kind === 'ok' || whole.kind === 'needs-spec') return whole;

  const words = clean(String(raw ?? '')).slice(0, 120).split(/[\s]+/).filter(Boolean);
  if (words.length < 2) return UNKNOWN;
  const plate = parseBriggsPlate(words);
  if (plate.kind === 'ok') return plate;

  let needsSpec: EngineInput | null = null;
  for (let size = 3; size >= 1; size -= 1) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const found = parseSingle(words.slice(start, start + size).join(' '));
      if (found.kind === 'ok') return found;
      if (found.kind === 'needs-spec' && !needsSpec) needsSpec = found;
    }
  }
  return needsSpec ?? UNKNOWN;
}

/** O que dizer ao atendente quando não deu para reconhecer. Curto e com exemplo: ele está com o cliente esperando. */
export function engineInputHelp(input: EngineInput): string | null {
  if (input.kind === 'ok') return null;
  if (input.kind === 'needs-spec') return `A Kohler pede o spec completo da plaqueta, por exemplo ${input.series}-0001. Confira o número depois do hífen.`;
  return 'Não reconheci o modelo. Digite como está na plaqueta, por exemplo FX921V-ES06 (Kawasaki), SV540-3212 (Kohler) ou 104M02-0002-F1 (Briggs).';
}
