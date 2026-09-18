/**
 * Lê o campo `comment` de cada item da vista explodida do Portal Husqvarna.
 *
 * Esse campo já vinha na query (`ipls { articles { comment } }`) e era
 * **descartado**. É ele que carrega, em texto, tudo o que o balcão precisa
 * descobrir à mão hoje. Exemplos capturados da API real (TS 142, artigo
 * 960410440, e motor HS 608, artigo 970710701):
 *
 *   "For 96041043000. HUSQVARNA MODEL NO. HS608 (COMPLETE IPL AVAILABLE SEPARATELY)."
 *   "For 96041036800, 96041036801, 96041036802, 96041036803. Engine Briggs Model No. 31R577-0027-B1 (587333501)."
 *   "ENGINE B&S MODEL NO. 44N677-0065-G1 (529581901)"
 *   "For 96041036802, 96041036803, 96041042200"
 *   "FOR ENGINE: 598693901"
 *   "FOR ENGINE: 596717001, 593230101"
 *   "CARBURETTOR GASKET - MULTIPACK: 10"
 *   "MUFFLER"
 *
 * Com isso a cadeia que o atendente percorre em sete passos no site vira duas
 * consultas:
 *
 *   máquina + PNC -> seção MOTOR -> `engineModel`/`engineArticle` do comment
 *                 -> IPL do motor -> seção CARBURADOR
 *                 -> item cujo `fitsEngineArticles` contém o motor daquele PNC
 *
 * Nada aqui adivinha: quando o texto não traz um dado, o campo vem vazio.
 */

export type EngineBrand = 'HUSQVARNA' | 'BRIGGS' | 'KAWASAKI' | 'KOHLER' | 'LONCIN' | 'OTHER';

export interface HusqvarnaIplComment {
  /** PNCs da MÁQUINA que este item atende ("For 96041043000, ..."). */
  fitsMachinePncs: string[];
  /** Artigos de MOTOR que este item atende ("FOR ENGINE: 598693901, ..."). */
  fitsEngineArticles: string[];
  /** Modelo do motor citado no texto ("HS608", "31R577-0027-B1"). */
  engineModel: string | null;
  /** Marca do motor, quando o texto a nomeia. */
  engineBrand: EngineBrand | null;
  /** Código do artigo do motor entre parênteses, quando existe. */
  engineArticle: string | null;
  /** O item é vendido em pacote fechado ("MULTIPACK: 10"). */
  multipackQuantity: number | null;
  /** O texto avisa que o motor tem catálogo próprio. */
  hasSeparateEngineIpl: boolean;
  /**
   * O portal declara a MARCA do motor mas manda ler o modelo na plaqueta.
   *
   * É o caso dos giro zero com motor Kawasaki: o item de motor do Z460 traz
   * apenas "Kawasaki - See Engine Model & Spec." — a própria Husqvarna avisa
   * que o modelo não está no catálogo dela. Não há o que deduzir aqui, e
   * fingir que há seria chutar o código. O produto tem que pedir a plaqueta.
   */
  engineModelOnPlate: boolean;
}

const EMPTY: HusqvarnaIplComment = {
  fitsMachinePncs: [],
  fitsEngineArticles: [],
  engineModel: null,
  engineBrand: null,
  engineArticle: null,
  multipackQuantity: null,
  hasSeparateEngineIpl: false,
  engineModelOnPlate: false,
};

function uniqueDigits(values: string[], min: number, max: number): string[] {
  const seen: string[] = [];
  for (const raw of values) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < min || digits.length > max) continue;
    if (!seen.includes(digits)) seen.push(digits);
  }
  return seen;
}

function brandFor(text: string): EngineBrand | null {
  if (/\bhusqvarna\b/i.test(text)) return 'HUSQVARNA';
  if (/\bbriggs\b|\bb&s\b|\bb\s*&\s*s\b/i.test(text)) return 'BRIGGS';
  if (/\bkawasaki\b/i.test(text)) return 'KAWASAKI';
  if (/\bkohler\b/i.test(text)) return 'KOHLER';
  if (/\bloncin\b/i.test(text)) return 'LONCIN';
  return null;
}

export function parseHusqvarnaIplComment(commentInput: string | null | undefined): HusqvarnaIplComment {
  const comment = (commentInput || '').trim();
  if (!comment) return { ...EMPTY };

  const result: HusqvarnaIplComment = { ...EMPTY, fitsMachinePncs: [], fitsEngineArticles: [] };

  // "FOR ENGINE: 596717001, 593230101" — precisa ser testado ANTES de "For ...",
  // senão o "For" genérico engole os números do motor como se fossem PNC.
  const engineFit = comment.match(/for\s+engine\s*:?\s*([\d\s,.-]+)/i);
  if (engineFit) {
    result.fitsEngineArticles = uniqueDigits(engineFit[1].split(/[,;]/), 6, 14);
  }

  if (!engineFit) {
    // "For 96041043000." / "For 96041036800, 96041036801, ..."
    const machineFit = comment.match(/\bfor\s+((?:\d[\d\s-]*)(?:\s*,\s*\d[\d\s-]*)*)/i);
    if (machineFit) {
      result.fitsMachinePncs = uniqueDigits(machineFit[1].split(/[,;]/), 8, 14);
    }
  }

  // "HUSQVARNA MODEL NO. HS608" / "Engine Briggs Model No. 31R577-0027-B1"
  // / "ENGINE B&S MODEL NO. 44N677-0065-G1"
  // O modelo pode trazer espaço: o TS 148 declara "HV 764cc". Aceitar um
  // sufixo de cilindrada evita capturar só "HV" e perder o resto.
  const modelDeclaration = comment.match(/model\s*n[o°]?\.?\s*:?\s*([A-Za-z0-9][A-Za-z0-9./-]*(?:\s+\d+\s*cc\b)?)/i);
  if (modelDeclaration) {
    result.engineModel = modelDeclaration[1].replace(/[.,;]+$/, '').trim() || null;
    // A marca é lida do trecho ANTES da declaração: "Engine Briggs Model No."
    result.engineBrand = brandFor(comment.slice(0, modelDeclaration.index ?? 0)) || brandFor(comment);
  }

  // O artigo do motor vem entre parênteses: "(587333501)", "(529581901)"
  const articleInParens = comment.match(/\((\d{6,14})\)/);
  if (articleInParens) result.engineArticle = articleInParens[1];

  // "MULTIPACK: 10" — o balcão precisa saber que a peça sai em pacote fechado,
  // senão promete uma unidade e o cliente recebe dez.
  const multipack = comment.match(/multipack\s*:?\s*(\d{1,4})/i);
  if (multipack) {
    const quantity = Number.parseInt(multipack[1], 10);
    if (Number.isFinite(quantity) && quantity > 1) result.multipackQuantity = quantity;
  }

  result.hasSeparateEngineIpl = /ipl\s+available\s+separately|complete\s+ipl/i.test(comment);

  // "Kawasaki - See Engine Model & Spec." / "See engine model and spec"
  if (!result.engineModel && /see\s+engine\s+model/i.test(comment)) {
    result.engineModelOnPlate = true;
    result.engineBrand = result.engineBrand || brandFor(comment);
  }

  return result;
}

/**
 * O item da vista serve este PNC de máquina?
 *
 * Sem "For ..." no texto, o item vale para todas as variantes daquela seção —
 * é o padrão do catálogo, e responder `false` esconderia peça legítima.
 */
export function iplCommentServesPnc(comment: HusqvarnaIplComment, pnc: string): boolean {
  if (!comment.fitsMachinePncs.length) return true;
  const digits = (pnc || '').replace(/\D/g, '');
  if (!digits) return true;
  return comment.fitsMachinePncs.some(candidate => candidate === digits || candidate.startsWith(digits) || digits.startsWith(candidate));
}

/**
 * O item da vista serve este artigo de motor?
 *
 * Mesma regra: sem "FOR ENGINE" o item não é restrito por motor.
 */
export function iplCommentServesEngine(comment: HusqvarnaIplComment, engineArticle: string): boolean {
  if (!comment.fitsEngineArticles.length) return true;
  const digits = (engineArticle || '').replace(/\D/g, '');
  if (!digits) return true;
  return comment.fitsEngineArticles.includes(digits);
}
