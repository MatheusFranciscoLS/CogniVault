import { normalizeText } from '../utils/normalize';
import { inferPartQueryRelation, type SearchGroup } from './part-vocabulary';

type CandidateText = {
  name: string;
  section?: string | null;
  aliases?: string[];
};

function searchable(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function matchesGroup(value: string, group: SearchGroup): boolean {
  const haystack = ` ${searchable(value)} `;
  if (!haystack.trim()) return false;
  return group.variants.some(variant => {
    const needle = searchable(variant);
    return Boolean(needle) && haystack.includes(` ${needle} `);
  });
}

/**
 * Evidência de nomenclatura específica do próprio item.
 *
 * Ex.: em "parafuso da embreagem", "Screw Clutch shoe" é evidência mais forte
 * do que um "SCREW" genérico que apenas aparece na vista CLUTCH. A mesma regra
 * vale para "mola do defletor", "porca do sabre" etc. Não cria compatibilidade,
 * código, modelo ou PNC; apenas desempata candidatos já existentes na base.
 */
export function relationSpecificityBonus(query: string, candidate: CandidateText): number {
  const relation = inferPartQueryRelation(query);
  if (!relation) return 0;

  const directText = [candidate.name, ...(candidate.aliases || [])].filter(Boolean).join(' ');
  const primaryInName = matchesGroup(directText, relation.primary);
  const contextInName = matchesGroup(directText, relation.context);
  if (!primaryInName || !contextInName) return 0;

  // O contexto no próprio nome/alias é mais específico que apenas pertencer à seção.
  // O bônus foi dimensionado para superar candidatos genéricos da mesma vista,
  // mantendo empate quando dois itens distintos têm nomenclatura igualmente específica.
  return 0.22;
}
