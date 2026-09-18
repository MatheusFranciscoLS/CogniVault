import { normalizeIdentifier } from './normalize';

/**
 * O Portal Husqvarna identifica máquina por um número de artigo de **9 dígitos**.
 *
 * O número que vem na etiqueta da máquina e nos textos "For 96041044000..." dos
 * catálogos é outra numeração, mais longa, e o portal **não a indexa**. Medido
 * contra a API real (`b2b-br-pt-br`, GraphQL `articles.byIds`):
 *
 *     articleId '96041044000'  (11 dígitos, como o app mandava) -> null
 *     articleId '960410440'    (9 dígitos)                      -> "HUSQVARNA TS 142"
 *     searchTerm '96041044000'                                  -> nenhum resultado
 *     searchTerm '960410440'                                    -> TS 142
 *
 * E o comprimento 9 não é coincidência daquele modelo: conferido em 8 máquinas
 * de 5 categorias (roçadeira 143R II `967332901`, motosserra 272 XP `965681601`,
 * cortador LC 121P `961330027`, LC 353AWD `970450102`, HU725AWDH `961430127`,
 * giro zero Z460 `967984802`, tratores TS 142 `960410440` e TS 148 `960410441`)
 * — **todos com exatamente 9 dígitos**.
 *
 * Por isso o app precisava truncar antes de consultar; sem isso, toda máquina
 * cuja etiqueta traz o número longo (os tratores, por exemplo) devolvia vazio e
 * o painel oficial sumia sem explicar o motivo.
 */
export const HUSQVARNA_ARTICLE_ID_LENGTH = 9;

/**
 * Candidatos de `articleId` para consultar o portal, do mais provável ao menos.
 *
 * Só ACRESCENTA candidato, nunca remove: um palpite que não existe simplesmente
 * não casa com nada na API, então a expansão é segura mesmo quando a etiqueta
 * traz um formato que eu não previ. É a mesma regra do `engineModelVariants`.
 */
export function husqvarnaArticleIdCandidates(pncInput: string): string[] {
  const digits = normalizeIdentifier(pncInput || '').replace(/\D/g, '');
  if (!digits) return [];

  const candidates: string[] = [];
  const add = (value: string) => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };

  if (digits.length === HUSQVARNA_ARTICLE_ID_LENGTH) {
    add(digits);
    return candidates;
  }

  if (digits.length > HUSQVARNA_ARTICLE_ID_LENGTH) {
    // O prefixo de 9 é o que o portal reconhece. Mantemos o número cheio como
    // segundo candidato: se algum dia a API passar a aceitá-lo, continua valendo.
    add(digits.slice(0, HUSQVARNA_ARTICLE_ID_LENGTH));
    add(digits);
    return candidates;
  }

  // Abaixo de 9 dígitos não há como inventar o que falta — devolvemos como veio
  // e deixamos a API decidir, em vez de completar com zero e consultar um
  // artigo que pode ser de outra máquina.
  add(digits);
  return candidates;
}

/**
 * O identificador que deve ser gravado/comparado como PNC do portal.
 * `null` quando não dá para afirmar qual é.
 */
export function husqvarnaArticleId(pncInput: string): string | null {
  const [first] = husqvarnaArticleIdCandidates(pncInput);
  return first && first.length === HUSQVARNA_ARTICLE_ID_LENGTH ? first : null;
}
