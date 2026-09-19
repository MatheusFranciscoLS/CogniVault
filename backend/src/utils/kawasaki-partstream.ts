/**
 * Catálogo de peças Kawasaki pelo ARI PartStream.
 *
 * O mapa medido da API está em `docs/KAWASAKI_ARI_PARTSTREAM.md`, incluindo por
 * que a conclusão anterior ("não dá para integrar") estava errada. Resumo da
 * cadeia, toda em JSON puro quando o parâmetro `cb` é omitido:
 *
 *   1. `/Parts/GetAutocomplete?search=<modelo>`  -> nome completo do modelo
 *   2. `/Search?model=<nome completo>`            -> `slugmid` e `slugmu` (GUID)
 *   3. `/Search/GetModelSearchAssembliesForPrompt` -> conjuntos, em `model.json`
 *   4. `/Parts/GetDetails?ariq=<slug do conjunto>` -> as peças
 *
 * **O passo 3 devolve a lista em `model.json`, não em `html`.** Olhar só o
 * `html` me fez concluir que a árvore vinha vazia — ela vem, com o `slug` de
 * cada conjunto já montado, pronto para o passo 4.
 *
 * Este módulo é só leitura e montagem: nada de rede, para os testes travarem o
 * formato sem depender do ARI estar de pé.
 */

/** Chave do site da Kawasaki. Ver a nota de decisão em `docs/`. */
export const KAWASAKI_APP_KEY = 'MrXKUgA9snz6mlf5kyGE';
export const KAWASAKI_ORIGIN = 'https://kawasakienginesusa.com/parts-lookup?aribrand=kwe';
const BASE = 'https://partstream.arinet.com';

export type KawasakiAssembly = {
  /** Nome como a Kawasaki mostra: `CARBURETOR(1/2)`, `*KITS GASKET / CYLINDER HEAD`. */
  name: string;
  /** Caminho do conjunto, como o `model.json` devolve (com `%2f%2f` no nome). */
  slug: string;
  /** Endereço no site da Kawasaki que abre a vista deste conjunto. */
  viewerUrl: string;
};

export type KawasakiPart = {
  /** Posição no desenho (`15004`), que a Kawasaki chama de "Ref". */
  position: string | null;
  /** Código da peça (`15004-0937`). É o campo que não pode sair errado. */
  partNumber: string;
  /** Descrição em inglês, como o catálogo publica (`CARBURETOR-ASSY`). */
  name: string;
};

/**
 * Parâmetros que toda chamada leva.
 *
 * `ariv` declara a origem e vai **duplo-encodado** — é assim que o widget da
 * Kawasaki monta, e com encode simples o ARI recusa.
 */
function commonQuery(): string {
  return `arik=${KAWASAKI_APP_KEY}&aril=en-US&ariv=${encodeURIComponent(encodeURIComponent(KAWASAKI_ORIGIN))}`;
}

export function kawasakiAutocompleteUrl(model: string): string {
  return `${BASE}/Parts/GetAutocomplete?brand=kwe&key=model&search=${encodeURIComponent(model)}&${commonQuery()}`;
}

export function kawasakiSearchUrl(fullModelName: string): string {
  return `${BASE}/Search?arib=KWE&model=${encodeURIComponent(fullModelName)}&page=1&responsive=y&${commonQuery()}`;
}

export function kawasakiAssembliesUrl(modelId: string, fullModelName: string, modelGuid: string): string {
  return `${BASE}/Search/GetModelSearchAssembliesForPrompt?arib=kwe&modelID=${encodeURIComponent(modelId)}`
    + `&arim=${encodeURIComponent(modelId)}`
    + `&modelName=${encodeURIComponent(encodeURIComponent(fullModelName))}`
    + `&modelUniqueTag=${encodeURIComponent(modelGuid)}&${commonQuery()}`;
}

/**
 * Peças de um conjunto.
 *
 * O `slug` entra com **encode simples**. Medido: duplo-encodar faz o ARI
 * responder "error has occurred", porque o slug já traz `%2f%2f` dentro do nome
 * do conjunto e o segundo encode transforma o `%` em `%25`.
 */
export function kawasakiPartsUrl(slug: string): string {
  return `${BASE}/Parts/GetDetails?ariq=${encodeURIComponent(slug)}&${commonQuery()}`;
}

/**
 * Endereço no site da Kawasaki que abre a vista do conjunto.
 *
 * É a saída que o dono pediu para quando o código não vem: *"se não deu um
 * retorno com o código, pelo menos dê um retorno com a vista explodida para que
 * o atendente verifique manualmente"*. Provado abrindo a URL num navegador
 * limpo — ela cai direto na vista, com a tabela de peças.
 */
export function kawasakiViewerUrl(slug: string): string {
  return `${KAWASAKI_ORIGIN}#${slug}`;
}

/**
 * Todos os modelos que o autocomplete devolve — **lista, não o primeiro**.
 *
 * Medido: `FR691V` (série sem spec) devolve **10** modelos (`-AR04`, `-AR06`,
 * `-AS00`…). Pegar o primeiro seria escolher o spec no lugar do atendente, e
 * spec diferente é catálogo de peças diferente — ou seja, código de peça
 * errado, que é o erro que este produto existe para não cometer.
 *
 * Quem decide é `resolveKawasakiModel`.
 */
export function parseKawasakiAutocomplete(payload: unknown): string[] {
  const model = (payload as { model?: unknown })?.model;
  if (!Array.isArray(model)) return [];
  return [...new Set(
    model
      .map(item => (item as { Data?: unknown })?.Data)
      .filter((data): data is string => typeof data === 'string')
      .map(data => data.trim())
      .filter(Boolean),
  )];
}

export type KawasakiModelChoice =
  | { kind: 'RESOLVED'; fullName: string }
  /** Série reconhecida, spec não: o atendente lê o spec na plaqueta. */
  | { kind: 'NEEDS_SPEC'; options: string[] }
  | { kind: 'NOT_FOUND' };

/** Só nome que começa com modelo completo (`FX921V-ES06 …`) é um modelo. */
const MODEL_NAME = /^[A-Z]{2}\d{3,4}[A-Z]-/;

/**
 * Decide entre "achei o modelo" e "preciso do spec".
 *
 * A entrada do balcão vem da plaqueta do motor, que traz **série + spec**
 * (`FX921V-ES06`). Quando o atendente digita só a série, a Kawasaki devolve
 * todos os specs da família — e aí a resposta honesta é perguntar, não
 * adivinhar. É a mesma disciplina do `PNC_REQUIRED` do chat.
 */
export function resolveKawasakiModel(query: string, candidates: string[]): KawasakiModelChoice {
  if (!candidates.length) return { kind: 'NOT_FOUND' };

  const pedido = String(query || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const modeloDe = (nome: string) => nome.trim().split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '');

  const exato = candidates.find(nome => modeloDe(nome) === pedido);
  if (exato) return { kind: 'RESOLVED', fullName: exato };

  const modelos = candidates.filter(nome => MODEL_NAME.test(nome.trim()));
  // Um só: não há escolha a fazer, então serve.
  if (modelos.length === 1) return { kind: 'RESOLVED', fullName: modelos[0] };
  if (modelos.length > 1) return { kind: 'NEEDS_SPEC', options: modelos };

  // Só resultado de família ("1000 Series – Carbureted (FX1000V, FX921V)").
  // Não é modelo, e abrir catálogo com ele daria peça de outro motor.
  return { kind: 'NOT_FOUND' };
}

export type KawasakiModelIds = { modelId: string; modelGuid: string; fullName: string } | null;

/**
 * Lê os três identificadores do HTML de `/Search`.
 *
 * Eles vivem em atributos do item de resultado, e os nomes não são óbvios:
 * `slugmid` é o id interno, `slugm` é o nome completo e `slugmu` é o GUID que
 * entra no caminho. Procurei `modelid=` primeiro e não achei nada.
 */
export function parseKawasakiModelIds(payload: unknown): KawasakiModelIds {
  const html = String((payload as { html?: unknown })?.html ?? '');
  const modelId = html.match(/slugmid="([^"]+)"/i)?.[1];
  const modelGuid = html.match(/slugmu="([^"]+)"/i)?.[1];
  const fullName = html.match(/slugm="([^"]+)"/i)?.[1];
  if (!modelId || !modelGuid || !fullName) return null;
  return { modelId, modelGuid, fullName };
}

/** Conjuntos do modelo. Vêm em `model.json`, cada um com o `slug` pronto. */
export function parseKawasakiAssemblies(payload: unknown): KawasakiAssembly[] {
  const rows = (payload as { model?: { json?: unknown } })?.model?.json;
  if (!Array.isArray(rows)) return [];

  const out: KawasakiAssembly[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const item = row as { data?: unknown; attr?: { slug?: unknown; rel?: unknown } };
    const name = String(item?.data ?? '').trim();
    const slug = String(item?.attr?.slug ?? '').trim();
    // `rel: 'assembly'` é o que distingue um conjunto de um nó de agrupamento.
    if (!name || !slug || item?.attr?.rel !== 'assembly') continue;
    if (!slug.startsWith('/Kawasaki_Engine/')) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ name, slug, viewerUrl: kawasakiViewerUrl(slug) });
  }

  return out;
}

/**
 * Peças da tabela de um conjunto.
 *
 * O ARI devolve HTML, e cada linha tem a marcação abaixo (verificada na
 * resposta real do `CARBURETOR(1/2)` do FX921V-ES06):
 *
 *     <tr id="ariPLRow_15004_7" class="ariPartInfo ...">
 *       <td class="listTD ariPLTag" ...>15004</td>
 *       <span class="ariPLSku" name="15004-0937">15004-0937</span>
 *       <td class='listTD ariPLDesc' ...> CARBURETOR-ASSY </td>
 *
 * O código sai do atributo `name` do `span.ariPLSku`, não do texto: o texto
 * pode vir com espaço ou marcação em volta, e **o código da peça é o campo onde
 * errar custa devolução no balcão**.
 *
 * Preço é ignorado de propósito: a Kawasaki publica
 * "Please Contact a Dealer" em todas as linhas. Preço nesta base vem do Portal
 * Parceiro ou da planilha, nunca do catálogo do fabricante.
 */
export function parseKawasakiParts(html: string): KawasakiPart[] {
  const linhas = String(html || '').split(/<tr\b/i).slice(1);
  const out: KawasakiPart[] = [];
  const seen = new Set<string>();

  for (const linha of linhas) {
    if (!/ariPartInfo/i.test(linha)) continue;

    const partNumber = linha.match(/class=["']?ariPLSku["']?[^>]*\sname=["']([^"']+)["']/i)?.[1]?.trim();
    if (!partNumber) continue;

    const position = linha.match(/ariPLTag["'][^>]*>\s*([^<]*)</i)?.[1]?.trim() || null;
    const name = linha.match(/ariPLDesc["'][^>]*>\s*([^<]*)</i)?.[1]?.replace(/\s+/g, ' ').trim() || '';

    const chave = `${position || ''}|${partNumber}`;
    if (seen.has(chave)) continue;
    seen.add(chave);

    out.push({ position, partNumber, name });
  }

  return out;
}
