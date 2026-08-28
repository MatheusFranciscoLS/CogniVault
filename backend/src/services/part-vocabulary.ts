import { normalizeText } from '../utils/normalize';

type VocabularyEntry = {
  key: string;
  terms: string[];
};

export type SearchGroup = {
  key: string;
  variants: string[];
};

const STOP_WORDS = new Set([
  'a', 'ao', 'aos', 'as', 'codigo', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'equipamento', 'essa', 'esse', 'esta', 'este', 'favor', 'maquina', 'modelo', 'na', 'nas',
  'no', 'nos', 'o', 'os', 'para', 'peca', 'pelo', 'por', 'preciso', 'qual', 'que', 'quero',
  'pnc', 'roçadeira', 'rocadeira', 'uma', 'um', 'husqvarna', 'stihl', 'honda', 'kawashima', 'toyama',
]);

// O catálogo Husqvarna usa principalmente inglês. Este vocabulário mantém a busca
// determinística no balcão, inclusive quando a API generativa estiver indisponível.
const VOCABULARY: VocabularyEntry[] = [
  { key: 'air-filter', terms: ['filtro de ar', 'filtro ar', 'air filter', 'airfilter', 'elemento filtrante'] },
  { key: 'fuel-filter', terms: ['filtro de combustivel', 'filtro combustivel', 'fuel filter'] },
  { key: 'carburettor', terms: ['carburador', 'carburettor', 'carburetor'] },
  { key: 'spark-plug', terms: ['vela de ignicao', 'vela ignicao', 'vela', 'spark plug', 'sparkplug'] },
  { key: 'ignition', terms: ['bobina de ignicao', 'bobina ignicao', 'modulo de ignicao', 'ignicao', 'ignition module', 'ignition'] },
  { key: 'clutch-drum', terms: ['tambor de embreagem', 'tambor embreagem', 'clutch drum'] },
  { key: 'clutch', terms: ['embreagem', 'clutch'] },
  { key: 'starter', terms: ['partida retratil', 'arranque', 'retratil', 'starter', 'starter housing'] },
  { key: 'starter-rope', terms: ['corda de partida', 'corda partida', 'starter rope', 'rope'] },
  { key: 'fuel-tank', terms: ['tanque de combustivel', 'tanque combustivel', 'fuel tank'] },
  { key: 'fuel-hose', terms: ['mangueira de combustivel', 'mangueira combustivel', 'fuel hose', 'fuel pipe'] },
  { key: 'fuel-cap', terms: ['tampa do tanque', 'tampa tanque', 'tampa de combustivel', 'fuel cap', 'tank cap'] },
  { key: 'muffler', terms: ['escapamento', 'silencioso', 'muffler', 'silencer'] },
  { key: 'cylinder', terms: ['cilindro', 'cylinder'] },
  { key: 'piston-ring', terms: ['anel do pistao', 'anel pistao', 'piston ring'] },
  { key: 'piston', terms: ['pistao', 'piston'] },
  { key: 'crankshaft', terms: ['virabrequim', 'crankshaft'] },
  { key: 'crankcase', terms: ['carcaca do motor', 'carter', 'crankcase'] },
  { key: 'air-purge', terms: ['bulbo primer', 'bulbo de combustivel', 'primer', 'air purge', 'purge bulb'] },
  { key: 'diaphragm', terms: ['diafragma', 'diaphragm'] },
  { key: 'choke', terms: ['afogador', 'choke'] },
  { key: 'throttle-cable', terms: ['cabo do acelerador', 'cabo acelerador', 'throttle cable'] },
  { key: 'throttle', terms: ['acelerador', 'throttle', 'trigger'] },
  { key: 'handle', terms: ['guidão', 'guidao', 'alça', 'alca', 'handle', 'handlebar'] },
  { key: 'spark-plug-cap', terms: ['cachimbo da vela', 'cachimbo vela', 'terminal da vela', 'spark plug cap', 'plug cap'] },
  { key: 'trimmer-head', terms: ['cabecote de nylon', 'cabeçote de nylon', 'cabecote de corte', 'carretel', 'trimmer head'] },
  { key: 'gear', terms: ['engrenagem', 'gear'] },
  { key: 'shaft', terms: ['eixo', 'shaft'] },
  { key: 'tube', terms: ['tubo', 'tube'] },
  { key: 'blade', terms: ['lamina', 'lâmina', 'faca', 'blade', 'knife'] },
  { key: 'guard', terms: ['protecao', 'protetor', 'guarda', 'guard', 'protection'] },
  { key: 'bearing', terms: ['rolamento', 'bearing'] },
  { key: 'bushing', terms: ['bucha', 'bushing'] },
  { key: 'spacer', terms: ['espacador', 'espaçador', 'spacer'] },
  { key: 'pin', terms: ['pino', 'pin'] },
  { key: 'lever', terms: ['alavanca', 'lever'] },
  { key: 'latch', terms: ['trava', 'trinco', 'latch'] },
  { key: 'cover', terms: ['tampa', 'cobertura', 'cover', 'cap'] },
  { key: 'housing', terms: ['carcaca', 'carcaça', 'alojamento', 'housing', 'crankcase'] },
  { key: 'seal', terms: ['retentor', 'vedacao', 'vedação', 'seal', 'sealing'] },
  { key: 'gasket', terms: ['junta', 'gasket'] },
  { key: 'o-ring', terms: ['anel o', 'o-ring', 'oring', 'o ring'] },
  { key: 'screw', terms: ['parafuso', 'screw'] },
  { key: 'nut', terms: ['porca', 'nut'] },
  { key: 'washer', terms: ['arruela', 'washer'] },
  { key: 'spring', terms: ['mola', 'spring'] },
  { key: 'bracket', terms: ['suporte', 'bracket', 'support'] },
  { key: 'clamp', terms: ['abracadeira', 'abraçadeira', 'clamp'] },
  { key: 'switch', terms: ['interruptor', 'chave', 'switch'] },
  { key: 'filter', terms: ['filtro', 'filter', 'airfilter'] },
];

function searchable(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function words(value: string): string[] {
  return searchable(value).split(/\s+/).filter(Boolean);
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

function fuzzyEqual(a: string, b: string): boolean {
  const longest = Math.max(a.length, b.length);
  if (longest < 5) return a === b;
  return distance(a, b) <= (longest >= 9 ? 2 : 1);
}

function entryMatches(query: string, queryWords: string[], entry: VocabularyEntry): boolean {
  return entry.terms.some(term => {
    const normalizedTerm = searchable(term);
    if (query === normalizedTerm || query.includes(` ${normalizedTerm} `) || query.startsWith(`${normalizedTerm} `) || query.endsWith(` ${normalizedTerm}`)) return true;
    const termWords = normalizedTerm.split(' ');
    return termWords.length === 1 && queryWords.some(word => fuzzyEqual(word, normalizedTerm));
  });
}

function normalizedVariants(entry: VocabularyEntry): string[] {
  const variants = entry.terms.flatMap(term => {
    const plain = normalizeText(term);
    const spaced = searchable(term);
    return plain === spaced ? [plain] : [plain, spaced];
  });
  return [...new Set(variants.filter(Boolean))];
}

export function findPartConcepts(value: string): SearchGroup[] {
  const query = ` ${searchable(value)} `;
  const queryWords = words(value);
  return VOCABULARY
    .filter(entry => entryMatches(query.trim(), queryWords, entry))
    .map(entry => ({ key: entry.key, variants: normalizedVariants(entry) }));
}

export function hasKnownPartVocabulary(value: string): boolean {
  return findPartConcepts(value).length > 0;
}

export function lexicalTerms(value: string, ignoredValues: string[] = []): string[] {
  const ignored = new Set(ignoredValues.flatMap(words));
  return [...new Set(words(value).filter(term => {
    const looksLikeModel = /[a-z]/.test(term) && /\d/.test(term);
    return term.length >= 3 && !looksLikeModel && !STOP_WORDS.has(term) && !ignored.has(term);
  }))].slice(0, 6);
}

export function buildSearchGroups(value: string, ignoredValues: string[] = []): SearchGroup[] {
  const concepts = findPartConcepts(value);
  const coveredWords = new Set(concepts.flatMap(concept => concept.variants.flatMap(words)));
  const literals = lexicalTerms(value, ignoredValues)
    .filter(term => ![...coveredWords].some(covered => fuzzyEqual(term, covered)))
    .map(term => ({ key: `literal:${term}`, variants: [term] }));
  return [...concepts, ...literals].slice(0, 6);
}

function matchStrength(value: string, variants: string[], exactScore: number, partialScore: number): number {
  const haystack = searchable(value);
  if (variants.some(variant => haystack === searchable(variant))) return exactScore;
  return variants.some(variant => haystack.includes(searchable(variant))) ? partialScore : 0;
}

export function scorePartText(
  query: string,
  candidate: { name: string; section?: string | null; aliases?: string[] },
): number {
  const groups = buildSearchGroups(query);
  if (!groups.length) return 0;

  const name = candidate.name || '';
  const aliases = (candidate.aliases || []).join(' ');
  const section = candidate.section || '';
  let total = 0;
  for (const group of groups) {
    const nameStrength = matchStrength(name, group.variants, 1, 0.72);
    const aliasStrength = matchStrength(aliases, group.variants, 0.85, 0.65);
    const sectionStrength = matchStrength(section, group.variants, 0.25, 0.25);
    total += Math.max(nameStrength, aliasStrength, sectionStrength);
  }
  return Math.max(0, Math.min(1, total / groups.length));
}
