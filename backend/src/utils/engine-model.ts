import { normalizeIdentifier } from './normalize';

/**
 * Formas equivalentes de um mesmo número de modelo de motor.
 *
 * Regra do fabricante, da página "Find Your Manual or Parts List" da Briggs &
 * Stratton (print enviado pelo proprietário em 2026-09-18):
 *
 *   Engine:  0XXXXX-XXXX   (modelo de 5 dígitos)*
 *            XXXXXX-XXXX   (modelo de 6 dígitos + tipo)
 *            XXXXXX-XXXX-XX (modelo + tipo + código)
 *   * "5-digit model numbers will have a leading zero."
 *   "Dashes are required after first 6 digits when entering model number."
 *
 * Os traços já não são problema: `normalizeIdentifier` remove separador, então
 * `103M02-0027-H1`, `103M02 0027 H1` e `103M020027H1` (a forma que aparece na
 * URL do IPL) caem todos em `103M020027H1`.
 *
 * O **zero à esquerda**, sim: a busca de peça filtra `normalizedModel` por
 * igualdade exata, então `9D9020027H1` e `09D9020027H1` são o mesmo motor e não
 * se encontram. Quem digita a etiqueta sem o zero não acha o catálogo gravado
 * com ele, e vice-versa.
 *
 * A expansão só **acrescenta** candidato — nenhuma variante remove resultado.
 * Por isso uma variante que não exista no catálogo é inofensiva: ela
 * simplesmente não casa com nada.
 */

/**
 * Prefixo de 5 ou 6 caracteres começando por dígito, seguido do tipo de 4
 * dígitos e, opcionalmente, do código de 2 caracteres.
 *
 * O `{4,5}` com retrocesso é o que separa os dois casos: em `103M020027H1` o
 * prefixo fecha com 6 (`103M02`), e em `9D9020027H1` o motor de 4 dígitos
 * obriga o prefixo a recuar para 5 (`9D902`).
 */
const ENGINE_MODEL_SHAPE = /^([0-9][0-9A-Z]{4,5})([0-9]{4})([0-9A-Z]{2})?$/;

export function engineModelVariants(value: string | null | undefined): string[] {
  const model = normalizeIdentifier(value);
  if (!model) return [];

  const match = ENGINE_MODEL_SHAPE.exec(model);
  if (!match) return [model];

  const [, prefix, type, code = ''] = match;

  // Modelo de 5 dígitos digitado sem o zero que o fabricante usa.
  if (prefix.length === 5) return [model, `0${prefix}${type}${code}`];

  // Guardado com o zero; alguém pode procurar sem ele.
  if (prefix.startsWith('0')) return [model, `${prefix.slice(1)}${type}${code}`];

  return [model];
}

/**
 * Formata um modelo de motor Briggs no formato que o site oficial exige na
 * busca de manual/vista explodida (`briggsandstratton.com/en-us/support/manuals`,
 * print do proprietário de 2026-09-18): traço depois dos 6 primeiros
 * caracteres, e zero à esquerda obrigatório para modelo de 5 dígitos.
 *
 * Aceita tanto o texto guardado no catálogo ("Motor Briggs 104M02-0002-F1",
 * às vezes com sufixo "(Cortador X)") quanto o código cru. Devolve `null`
 * quando a entrada não tem o formato de modelo Briggs — nunca um link
 * formatado errado, porque link quebrado no balcão é pior que nenhum.
 */
export function formatBriggsModelForSearch(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const stripped = raw
    .replace(/^\s*motor\s+briggs\s*(?:&|and)?\s*(?:stratton)?\s*/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
  const normalized = normalizeIdentifier(stripped);

  const match = ENGINE_MODEL_SHAPE.exec(normalized);
  if (!match) return null;

  const [, prefix, type, code = ''] = match;
  // O site categoriza como "5-digit model" o que aqui é um prefixo de 5: por
  // isso o zero é sempre adicionado nesse caso, nunca deixado a critério de
  // como o balcão digitou.
  const canonicalPrefix = prefix.length === 5 ? `0${prefix}` : prefix;
  return code ? `${canonicalPrefix}-${type}-${code}` : `${canonicalPrefix}-${type}`;
}

/**
 * Link para a busca oficial de manual/vista explodida da Briggs & Stratton.
 *
 * Não existe API pública da Briggs equivalente ao GraphQL da Husqvarna, e o
 * catálogo deles não tem português (inglês ou, como no exemplo real do
 * proprietário, chinês) — por isso este é só um link de busca, não uma
 * integração: mesmo padrão do botão manual do Portal Parceiro Husqvarna
 * (abrir em nova aba, sem scraping, sem login automatizado). O balcão abre e
 * lê a vista explodida por conta própria; o app não tenta interpretar peça
 * nenhuma desse catálogo.
 */
export function briggsManualsSearchUrl(raw: string | null | undefined): string | null {
  const formatted = formatBriggsModelForSearch(raw);
  if (!formatted) return null;
  return `https://www.briggsandstratton.com/pt-br/support/manuals/results?search=${encodeURIComponent(formatted)}`;
}

/**
 * Modelo Kawasaki no formato que o localizador da marca aceita.
 *
 * A plaqueta do motor traz **série + spec**: `FX921V-ES06` é a série `FX921V`
 * com o spec `ES06`. O dono confirmou esse formato no próprio site
 * (`kawasakienginesusa.com/parts-lookup`), onde o autocompletar só reconhece o
 * modelo quando os dois vêm juntos.
 *
 * Por que o atendente precisa digitar: o Portal Husqvarna **não informa** o
 * modelo do motor Kawasaki. O item de motor do Z460 traz apenas
 * "Kawasaki - See Engine Model & Spec." — a própria Husqvarna manda ler a
 * plaqueta. Não há o que deduzir, e deduzir seria chutar o código da peça.
 */
export function formatKawasakiModelForSearch(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^\s*motor\s+kawasaki\s*/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const match = /^([A-Z]{2}\d{3}[A-Z])([A-Z]{2}\d{2})?$/.exec(cleaned);
  if (!match) return null;
  const [, series, spec] = match;
  return spec ? `${series}-${spec}` : series;
}

/**
 * Verdadeiro só quando há EVIDÊNCIA de que o catálogo é de motor Kawasaki.
 *
 * Existe porque a forma do modelo não basta, e isso foi medido:
 * `formatKawasakiModelForSearch` reconhece `LC121P` e `LB155S` — que são
 * cortadores **Husqvarna**, não motores Kawasaki. O padrão `[A-Z]{2}d{3}[A-Z]`
 * é o mesmo dos dois fabricantes.
 *
 * Oferecer "Catálogo Kawasaki" num cortador Husqvarna manda o atendente ao
 * catálogo errado, que é o erro mais caro deste produto. Então a decisão exige
 * a marca dita em algum lugar: no campo `manufacturer` ou no nome do arquivo.
 * Sem isso, não há botão — e não ter botão é o resultado correto, porque o
 * modelo Kawasaki vem da plaqueta do motor e o Portal Husqvarna não o informa.
 */
export function hasKawasakiEvidence(
  manufacturer: string | null | undefined,
  filename: string | null | undefined,
  model: string | null | undefined,
): boolean {
  return /kawasaki/i.test(`${manufacturer || ''} ${filename || ''} ${model || ''}`);
}

/**
 * Localizador oficial de peças da Kawasaki.
 *
 * **Não é link profundo, e não pode ser.** Medido: a URL completa de um
 * conjunto carrega dois GUIDs
 * (`.../FX921V-ES06_4_Stroke_Engine_FX921V/*KITS_GASKET.../63e707fb-…/97b0edbd-…`)
 * e abrir o endereço só com o modelo devolve a página genérica de busca — sem
 * a grade de conjuntos. Gerar um link que parece funcionar e abre vazio é pior
 * para o balcão do que um link honesto para a busca.
 *
 * Então o padrão é o mesmo já decidido para o Portal Parceiro: abre a busca
 * oficial e o atendente cola o modelo, que este helper já devolve formatado.
 */
export function kawasakiPartsLookupUrl(): string {
  return 'https://kawasakienginesusa.com/parts-lookup';
}
