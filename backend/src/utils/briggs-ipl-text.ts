import { isPlausiblePartNumber } from './part-number';

/**
 * Leitura da lista de peças da Briggs a partir do PDF, com a MESMA disciplina
 * do extrator de catálogo: só aceita quando tem certeza, e **recusa dizendo o
 * motivo** em vez de chutar.
 *
 * Pedido do dono com estas palavras: *"Eu queria travar essa mesma lógica: mas
 * eu recomendaria travar com a mesma disciplina do extrator de catálogo: só
 * aceitar quando o parser tiver certeza, e recusar em vez de chutar."*
 *
 * A regra de fundo é a que governa o produto: *"meu medo é ela não ter certeza
 * do código da peça e mandar qualquer um"*. Aqui não há IA nenhuma — é regex
 * sobre a camada de texto do PDF oficial — mas o risco é o mesmo, porque um
 * número lido da coluna errada é um código errado com aparência de certo.
 *
 * ## O formato, medido em 4 PDFs reais
 *
 *     Mfg. No: 104M02-0002-F1                      <- assinatura
 *     REF NO  PART NO  QTY  DESCRIPTION            <- cabeçalho da tabela
 *     5 595353 HEAD, Cylinder                      <- sem QTY no texto
 *     305 590586 3 SCREW                           <- COM QTY no meio
 *     3 299819S 1 SEAL, Oil                        <- código com sufixo
 *     13 590512 SCREW
 *     -(Cylinder Head)                             <- qualificador da anterior
 *
 * `<posição> <código> [<quantidade>] <descrição>`. A quantidade é opcional na
 * extração — em `104M02-0002-F1` nenhuma linha a traz, em `09P702-0212-F1`
 * 53 de 131 trazem. É por isso que ela **não** pode ser deduzida da posição do
 * token: o terceiro campo é quantidade quando tem 1–2 dígitos, e descrição
 * quando é texto.
 *
 * A descrição segue a convenção que o dono ensinou — `GASKET, Cylinder Head` é
 * a **junta** do cabeçote, não o cabeçote. A vírgula separa o substantivo
 * principal do qualificador, e é o mesmo formato que `part-head-noun.ts` já
 * entende.
 */

export type BriggsIplPart = {
  /** Coluna REF NO: a posição no desenho. */
  position: string;
  /** Coluna PART NO. O campo onde errar custa devolução. */
  partNumber: string;
  /** Coluna DESCRIPTION, como a Briggs publica (em inglês). */
  name: string;
  /** Coluna QTY, quando aparece na extração. `null` nunca vira 1. */
  quantity: number | null;
  /** Conjunto da página (`Air Cleaner, Cylinder Head`), quando identificado. */
  section: string | null;
  /** Qualificador da linha seguinte (`-(Intake)`), quando existe. */
  qualifier: string | null;
};

/**
 * Por que a leitura foi recusada. Espelha a intenção de
 * `DeterministicDeclineReason` do extrator de catálogo: o motivo é o que
 * permite decidir entre "ensinar o parser" e "a fonte não serve".
 */
export type BriggsDeclineReason =
  /** PDF sem camada de texto: seria OCR, e OCR de código é chute. */
  | 'NO_TEXT_LAYER'
  /** Não parece um Parts Manual da Briggs. */
  | 'NO_SIGNATURE'
  /** Sem `Mfg. No:` — é o caso do PDF chinês, que também não serve ao balcão. */
  | 'NO_MODEL'
  /** O `Mfg. No:` do PDF é de OUTRO motor. */
  | 'MODEL_MISMATCH'
  /** Assinatura reconhecida, nenhuma linha de peça extraída. */
  | 'NO_ROWS'
  /** Poucas linhas: tabela pequena é onde o falso positivo mora. */
  | 'TOO_FEW_ROWS'
  /** Descrições não latinas (chinês, japonês): o código pode estar certo, mas
   *  a descrição não serve para o balcão conferir a peça. */
  | 'NOT_LATIN';

export type BriggsIplResult =
  | { ok: true; model: string; parts: BriggsIplPart[] }
  | { ok: false; reason: BriggsDeclineReason; detail?: Record<string, unknown> };

/**
 * Mínimo de linhas para aceitar a leitura.
 *
 * Mesmo espírito do `MIN_CATALOG_OCCURRENCES = 10` do extrator de catálogo, e
 * pelo mesmo motivo: tabela pequena vira falso positivo com facilidade, e uma
 * lista errada envenena a busca inteira. Medido nos PDFs reais: 131, 137, 197 e
 * 203 linhas. O piso de 20 fica bem longe do que a fonte entrega de verdade e
 * bem longe do que um falso positivo produziria.
 */
const MIN_ROWS = 20;

/** `Mfg. No: 104M02-0002-F1` — a assinatura de modelo do Parts Manual. */
const MFG_NO = /Mfg\.\s*No:\s*([0-9A-Z]{5,8}(?:-[0-9A-Z]{2,4}){0,2})/i;

/**
 * `<posição> <código> [<quantidade>] <descrição>`.
 *
 * A quantidade é capturada só quando tem 1–2 dígitos **e** vem antes de texto:
 * é o que a distingue de um código (5–7 dígitos) e de uma descrição que comece
 * com número.
 */
const ROW = /^\s*(\d{1,4}[A-Z]?)\s+(\d{5,7}[A-Z]?)\s+(?:(\d{1,2})\s+)?(\S.*?)\s*$/;

/** `-(Intake)`, `-(Cylinder Head)`: qualifica a linha imediatamente anterior. */
const QUALIFIER = /^\s*-\(([^)]{1,60})\)\s*$/;

/** Cabeçalho de tabela; marca o início de um bloco de peças. */
const TABLE_HEADER = /REF\s*NO/i;

function normalizeModel(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Verdadeiro quando a descrição é legível para o balcão brasileiro.
 *
 * O PDF chinês do `103M02-0027-H1` traz `缸体组件` e `海豹油`. O código ali pode
 * até estar certo, mas o atendente não tem como conferir se é a peça pedida —
 * e conferir é justamente o que a descrição serve para fazer. Melhor recusar a
 * leitura e deixar o PDF como vista explodida.
 */
function looksLatin(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (!letters) return false;
  const latin = letters.replace(/[^\p{Script=Latin}]/gu, '');
  return latin.length / letters.length >= 0.8;
}

/**
 * Lê a lista de peças do texto de um Parts Manual da Briggs.
 *
 * `expectedModel` é conferido contra o `Mfg. No:` do próprio PDF: a URL do
 * visualizador é montada a partir do modelo, e um erro ali entregaria a lista
 * de outro motor com aparência de certa.
 */
export function analyzeBriggsIplText(text: string, expectedModel?: string | null): BriggsIplResult {
  const conteudo = String(text || '');

  // PDF digitalizado não tem texto para casar regex nenhuma. Distinguir isso de
  // "texto lido mas não reconhecido" é o que separa limite da fonte de lacuna
  // do parser — a mesma distinção que o extrator de catálogo faz.
  if (conteudo.trim().length < 200) {
    return { ok: false, reason: 'NO_TEXT_LAYER', detail: { textLength: conteudo.length } };
  }

  if (!/Parts\s*Manual/i.test(conteudo) && !TABLE_HEADER.test(conteudo)) {
    return { ok: false, reason: 'NO_SIGNATURE' };
  }

  const modelo = conteudo.match(MFG_NO)?.[1];
  if (!modelo) {
    // É o caso do PDF chinês, que não traz a assinatura. Recusar aqui é o
    // comportamento certo: sem saber de que motor é a lista, ela não vale.
    return { ok: false, reason: 'NO_MODEL' };
  }

  if (expectedModel && normalizeModel(modelo) !== normalizeModel(expectedModel)) {
    return {
      ok: false,
      reason: 'MODEL_MISMATCH',
      detail: { noPdf: modelo, pedido: expectedModel },
    };
  }

  const linhas = conteudo.split(/\r?\n/);
  const parts: BriggsIplPart[] = [];
  const vistos = new Set<string>();
  let secao: string | null = null;
  let ultimaForaDeTabela = '';

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];

    // O nome do conjunto vem repetido em colunas logo antes do cabeçalho da
    // tabela; guarda-se a última linha de texto antes dele.
    if (TABLE_HEADER.test(linha)) {
      secao = ultimaForaDeTabela || null;
      continue;
    }

    const casou = ROW.exec(linha);
    if (!casou) {
      const limpo = linha.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
      // Linha de texto comum: candidata a nome de conjunto na próxima tabela.
      if (limpo && !QUALIFIER.test(linha) && !/^--\s*\d+\s*of\s*\d+/.test(limpo)) {
        // O cabeçalho repete o nome 4x ("A\tA\tA\tA"); fica só a primeira.
        ultimaForaDeTabela = limpo.split(/\s{2,}/)[0].trim();
      }
      continue;
    }

    const [, position, partNumber, qty, descricaoCrua] = casou;
    const name = descricaoCrua.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) continue;

    // A mesma regra que barra a gravação de peça no `ai.service`. Aqui ela vem
    // antes de a linha existir, não depois.
    if (!isPlausiblePartNumber(partNumber)) continue;

    const qualificadorSeguinte = linhas[i + 1] ? QUALIFIER.exec(linhas[i + 1]) : null;

    const chave = `${position}|${partNumber}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    parts.push({
      position,
      partNumber,
      name,
      quantity: qty ? Number(qty) : null,
      section: secao,
      qualifier: qualificadorSeguinte ? qualificadorSeguinte[1].trim() : null,
    });
  }

  if (!parts.length) return { ok: false, reason: 'NO_ROWS', detail: { model: modelo } };

  if (parts.length < MIN_ROWS) {
    return { ok: false, reason: 'TOO_FEW_ROWS', detail: { model: modelo, rows: parts.length, minimo: MIN_ROWS } };
  }

  // Descrições não latinas: o código pode estar certo, mas o atendente não tem
  // como conferir a peça — e é para conferir que a descrição existe.
  const amostra = parts.slice(0, 40).map(part => part.name).join(' ');
  if (!looksLatin(amostra)) {
    return { ok: false, reason: 'NOT_LATIN', detail: { model: modelo, amostra: amostra.slice(0, 40) } };
  }

  return { ok: true, model: modelo, parts };
}

/** Rótulo em português do motivo, para a tela e para o painel de qualidade. */
export function briggsDeclineLabel(reason: BriggsDeclineReason): string {
  const labels: Record<BriggsDeclineReason, string> = {
    NO_TEXT_LAYER: 'PDF digitalizado (sem texto para ler)',
    NO_SIGNATURE: 'não parece uma lista de peças da Briggs',
    NO_MODEL: 'o PDF não diz de que motor é',
    MODEL_MISMATCH: 'o PDF é de outro motor',
    NO_ROWS: 'nenhuma linha de peça reconhecida',
    TOO_FEW_ROWS: 'poucas linhas reconhecidas para confiar',
    NOT_LATIN: 'descrições em outro alfabeto (chinês/japonês)',
  };
  return labels[reason];
}
