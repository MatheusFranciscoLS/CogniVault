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
  /**
   * O que o qualificador significa, quando dá para afirmar.
   *
   * O texto cru já ia para `qualifier`, mas em inglês e misturado — o balcão
   * não ia ler. Estas são as que mudam a venda.
   */
  notes: BriggsPartNote[];
};

/**
 * Avisos que a Briggs escreve no IPL e que decidem se a peça serve.
 *
 * São o equivalente Briggs do campo `comment` da Husqvarna: texto solto que
 * carrega a regra de aplicação. Medido no IPL real do `104M02-0002-F1`.
 *
 * O mais perigoso é o code date: o mesmo motor tem **duas peças diferentes na
 * mesma posição**, separadas só pela data de fabricação gravada nele —
 *
 *     209 590541 SPRING, Governor
 *     -Used Before Code Date 17092700
 *     209 596459 SPRING, Governor
 *     -Used After Code Date 17092600
 *
 * Sem o aviso as duas aparecem iguais na tela, e metade das vendas sai errada.
 */
export type BriggsPartNote =
  /** Só serve em motor fabricado ANTES deste code date. */
  | { kind: 'CODE_DATE_BEFORE'; codeDate: string }
  /** Só serve em motor fabricado A PARTIR deste code date. */
  | { kind: 'CODE_DATE_AFTER'; codeDate: string }
  /** A Briggs não fornece mais. Vender é prometer o que não chega. */
  | { kind: 'DISCONTINUED' }
  /** Usar a peça desta posição no lugar. Costuma vir junto de `DISCONTINUED`. */
  | { kind: 'SEE_REFERENCE'; position: string }
  /** Não se vende avulsa: só dentro do kit. */
  | { kind: 'KIT_ONLY' }
  /** Só funciona junto da peça daquela posição. */
  | { kind: 'ONLY_WITH'; position: string };

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
 * é o que a distingue de um código (5–8 dígitos) e de uma descrição que comece
 * com número.
 *
 * **O teto era 7 e estava errado.** A Briggs também emite código de 8 dígitos, e
 * o regex antigo descartava essas linhas **em silêncio**. Medido no IPL do
 * `104M02-0002-F1`: 4 peças perdidas por catálogo, e não eram parafusos —
 *
 *     455B 84013130 CUP, Flywheel
 *     608B 84013129 STARTER, Rewind
 *     957  84004416 CAP, Fuel
 *     972B 84004115 TANK, Fuel
 *
 * Motor de partida, tanque e tampa de tanque são peça de balcão todo dia.
 * Alargar para 8 acrescentou exatamente essas 4 linhas e nenhuma outra.
 */
const ROW = /^\s*(\d{1,4}[A-Z]?)\s+(\d{5,8}[A-Z]?)\s+(?:(\d{1,2})\s+)?(\S.*?)\s*$/;

/**
 * Qualquer linha começada por `-` qualifica a peça imediatamente anterior.
 *
 * A versão antiga exigia parênteses ao redor de tudo, e por isso **perdia**
 * justamente as notas que mudam a venda, que vêm sem eles:
 *
 *     -(Intake)                                    <- pegava
 *     -Used Before Code Date 17092700              <- perdia
 *     -Used Before Code Date 26080500 (No Longer Available) (See Reference 300D
 *     for Service)                                 <- perdia, e ainda quebra linha
 */
const QUALIFIER = /^\s*-\s*(\S.*)$/;

/** Falso enquanto sobrar parêntese aberto — o qualificador quebrou linha. */
function parentesesFechados(texto: string): boolean {
  let abertos = 0;
  for (const ch of texto) {
    if (ch === '(') abertos += 1;
    else if (ch === ')') abertos -= 1;
  }
  return abertos <= 0;
}

/**
 * Extrai as notas que mudam a venda.
 *
 * O que não casar fica só no texto cru: **não inventar significado**. Nota mal
 * interpretada é pior que nota nenhuma, porque ela parece informação.
 */
export function briggsPartNotes(qualifier: string | null): BriggsPartNote[] {
  if (!qualifier) return [];
  const notes: BriggsPartNote[] = [];

  const antes = /Used\s+Before\s+Code\s+Date\s+(\d{6,10})/i.exec(qualifier);
  if (antes) notes.push({ kind: 'CODE_DATE_BEFORE', codeDate: antes[1] });

  const depois = /Used\s+After\s+Code\s+Date\s+(\d{6,10})/i.exec(qualifier);
  if (depois) notes.push({ kind: 'CODE_DATE_AFTER', codeDate: depois[1] });

  if (/No\s+Longer\s+Available/i.test(qualifier)) notes.push({ kind: 'DISCONTINUED' });

  const veja = /See\s+Reference\s+(\d{1,4}[A-Z]?)/i.exec(qualifier);
  if (veja) notes.push({ kind: 'SEE_REFERENCE', position: veja[1].toUpperCase() });

  if (/Must\s+Be\s+Replaced\s+As\s+A\s+Kit/i.test(qualifier)) notes.push({ kind: 'KIT_ONLY' });

  const somenteCom = /Only\s+For\s+Use\s+With\s+Reference\s+(\d{1,4}[A-Z]?)/i.exec(qualifier);
  if (somenteCom) notes.push({ kind: 'ONLY_WITH', position: somenteCom[1].toUpperCase() });

  return notes;
}

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
    let qualifier: string | null = null;
    if (qualificadorSeguinte) {
      let texto = qualificadorSeguinte[1].trim();
      // No máximo UMA continuação. O caso real quebra em duas linhas; aceitar
      // mais arriscaria engolir a peça seguinte se um parêntese nunca fechar.
      if (!parentesesFechados(texto)) {
        const seguinte = (linhas[i + 2] ?? '').trim();
        if (seguinte && !QUALIFIER.test(seguinte) && !ROW.test(seguinte)) {
          texto = `${texto} ${seguinte}`.replace(/\s+/g, ' ').trim();
          // Pula a continuação para ela não virar candidata a nome de conjunto.
          i += 1;
        }
      }
      // Quando é exatamente um grupo entre parênteses (`(Intake)`), desembrulha
      // — é a forma antiga e continua sendo a mais legível na tela.
      const soUmGrupo = /^\(([^()]{1,80})\)$/.exec(texto);
      qualifier = (soUmGrupo ? soUmGrupo[1] : texto).trim();
    }

    const chave = `${position}|${partNumber}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    parts.push({
      position,
      partNumber,
      name,
      quantity: qty ? Number(qty) : null,
      section: secao,
      qualifier,
      notes: briggsPartNotes(qualifier),
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
