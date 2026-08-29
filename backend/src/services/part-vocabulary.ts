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

// Modificadores de linguagem natural que refinam a intenção, mas não devem virar
// um AND textual obrigatório. Quando o conceito já é conhecido (ex.: embreagem),
// estes termos são incorporados pelos próprios sinônimos do conceito.
const QUERY_MODIFIERS = new Set([
  'completa', 'completo', 'conjunto', 'conjunto completo', 'assy', 'assembly',
  'peca completa', 'peça completa', 'inteira', 'inteiro',
]);

// Ontologia compacta de balcão: PT-BR, PT-PT e nomenclatura técnica inglesa dos
// catálogos Husqvarna. Ela não inventa aplicação/código; apenas aproxima nomes da
// mesma peça para recuperar candidatos já existentes no banco técnico.
const VOCABULARY: VocabularyEntry[] = [
  { key: 'air-filter', terms: ['filtro de ar', 'filtro ar', 'air filter', 'airfilter', 'elemento filtrante', 'elemento do filtro de ar'] },
  { key: 'fuel-filter', terms: ['filtro de combustivel', 'filtro combustivel', 'fuel filter', 'filtro de gasolina'] },
  { key: 'carburettor', terms: ['carburador', 'carburador completo', 'carburettor', 'carburetor', 'carburettor assy', 'carburetor assy', 'carburettor assembly', 'carburetor assembly'] },
  { key: 'spark-plug', terms: ['vela de ignicao', 'vela ignicao', 'vela', 'spark plug', 'sparkplug'] },
  { key: 'ignition', terms: ['bobina de ignicao', 'bobina ignicao', 'modulo de ignicao', 'ignicao', 'ignition module', 'ignition', 'bobine de ignicao'] },
  { key: 'clutch-drum', terms: ['tambor de embreagem', 'tambor embreagem', 'tambor de embraiagem', 'tambor embraiagem', 'clutch drum', 'drum clutch'] },
  {
    key: 'clutch',
    terms: [
      'embreagem', 'embraiagem', 'clutch',
      'embreagem completa', 'embraiagem completa', 'conjunto de embreagem', 'conjunto da embreagem',
      'conjunto de embraiagem', 'conjunto da embraiagem', 'clutch assy', 'clutch assembly', 'complete clutch',
    ],
  },
  { key: 'starter', terms: ['partida retratil', 'arranque', 'retratil', 'starter', 'starter housing', 'recoil starter', 'arranque completo'] },
  { key: 'starter-rope', terms: ['corda de partida', 'corda partida', 'corda de arranque', 'starter rope', 'recoil rope', 'rope'] },
  { key: 'fuel-tank', terms: ['tanque de combustivel', 'tanque combustivel', 'deposito de combustivel', 'deposito combustivel', 'fuel tank'] },
  { key: 'fuel-hose', terms: ['mangueira de combustivel', 'mangueira combustivel', 'tubo de combustivel', 'tubo combustivel', 'fuel hose', 'fuel pipe', 'fuel line'] },
  { key: 'fuel-cap', terms: ['tampa do tanque', 'tampa tanque', 'tampa de combustivel', 'tampa do deposito', 'fuel cap', 'tank cap'] },
  { key: 'muffler', terms: ['escapamento', 'silencioso', 'silenciador', 'muffler', 'silencer'] },
  { key: 'cylinder', terms: ['cilindro', 'cylinder'] },
  { key: 'piston-ring', terms: ['anel do pistao', 'anel pistao', 'segmento do pistao', 'piston ring'] },
  { key: 'piston', terms: ['pistao', 'piston'] },
  { key: 'crankshaft', terms: ['virabrequim', 'cambota', 'crankshaft'] },
  { key: 'crankcase', terms: ['carcaca do motor', 'carter', 'cárter', 'crankcase'] },
  { key: 'air-purge', terms: ['bulbo primer', 'bulbo de combustivel', 'primer', 'air purge', 'purge bulb'] },
  { key: 'diaphragm', terms: ['diafragma', 'membrana', 'diaphragm'] },
  { key: 'choke', terms: ['afogador', 'choke'] },
  { key: 'throttle-cable', terms: ['cabo do acelerador', 'cabo acelerador', 'cabo de acelerador', 'throttle cable'] },
  { key: 'throttle', terms: ['acelerador', 'gatilho do acelerador', 'throttle', 'trigger'] },
  { key: 'handle', terms: ['guidão', 'guidao', 'alça', 'alca', 'punho', 'pega', 'handle', 'handlebar', 'grip'] },
  { key: 'spark-plug-cap', terms: ['cachimbo da vela', 'cachimbo vela', 'terminal da vela', 'spark plug cap', 'plug cap'] },
  { key: 'trimmer-head', terms: ['cabecote de nylon', 'cabeçote de nylon', 'cabecote de corte', 'carretel', 'cabeça de corte', 'trimmer head'] },
  { key: 'gear', terms: ['engrenagem', 'carreto', 'gear'] },
  { key: 'shaft', terms: ['eixo', 'veio', 'shaft'] },
  { key: 'tube', terms: ['tubo', 'tube'] },
  { key: 'blade', terms: ['lamina', 'lâmina', 'faca', 'blade', 'knife'] },
  { key: 'guard', terms: ['protecao', 'protetor', 'guarda', 'protection', 'guard'] },
  { key: 'bearing', terms: ['rolamento', 'rolamento de esferas', 'bearing'] },
  { key: 'bushing', terms: ['bucha', 'casquilho', 'bushing', 'bush'] },
  { key: 'spacer', terms: ['espacador', 'espaçador', 'distanciador', 'spacer'] },
  { key: 'pin', terms: ['pino', 'cavilha', 'pin'] },
  { key: 'lever', terms: ['alavanca', 'lever'] },
  { key: 'latch', terms: ['trava', 'trinco', 'fecho', 'latch'] },
  { key: 'cover', terms: ['tampa', 'cobertura', 'cover', 'cap'] },
  { key: 'housing', terms: ['carcaca', 'carcaça', 'alojamento', 'housing', 'crankcase'] },
  { key: 'seal', terms: ['retentor', 'vedacao', 'vedação', 'vedante', 'seal', 'sealing'] },
  { key: 'gasket', terms: ['junta', 'junta de vedacao', 'gasket'] },
  { key: 'o-ring', terms: ['anel o', 'o-ring', 'oring', 'o ring', 'anel de vedacao'] },
  { key: 'screw', terms: ['parafuso', 'screw', 'bolt'] },
  { key: 'nut', terms: ['porca', 'nut'] },
  { key: 'washer', terms: ['arruela', 'anilha', 'washer'] },
  { key: 'spring', terms: ['mola', 'spring'] },
  { key: 'bracket', terms: ['suporte', 'bracket', 'support'] },
  { key: 'clamp', terms: ['abracadeira', 'abraçadeira', 'grampo', 'clamp'] },
  { key: 'switch', terms: ['interruptor', 'chave', 'switch'] },
  { key: 'filter', terms: ['filtro', 'filter', 'airfilter'] },
];

const ENTRY_BY_KEY = new Map(VOCABULARY.map(entry => [entry.key, entry]));

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
  const modifiers = new Set([...QUERY_MODIFIERS].flatMap(words));
  return [...new Set(words(value).filter(term => {
    const looksLikeModel = /[a-z]/.test(term) && /\d/.test(term);
    return term.length >= 3
      && !looksLikeModel
      && !STOP_WORDS.has(term)
      && !modifiers.has(term)
      && !ignored.has(term);
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

/**
 * Expande a consulta para embeddings sem trocar a pergunta original. Isso faz
 * "embreagem" ficar semanticamente próxima de "EMBRAIAGEM", "CLUTCH" e
 * "CLUTCH ASSY" mesmo quando o catálogo foi indexado em outro idioma.
 */
export function semanticQueryText(value: string, ignoredValues: string[] = []): string {
  const groups = buildSearchGroups(value, ignoredValues);
  const variants = [...new Set(groups.flatMap(group => group.variants))].slice(0, 28);
  if (!variants.length) return value.trim();
  return [value.trim(), `Equivalentes técnicos: ${variants.join(', ')}`].filter(Boolean).join('\n');
}

/**
 * Equivalentes gerados deterministicamente para enriquecer o texto de embedding
 * do documento. Não são gravados como nomes oficiais/alternativeNames.
 */
export function inferredSearchAliases(name: string, section = '', aliases: string[] = []): string[] {
  const concepts = findPartConcepts([name, section, ...aliases].filter(Boolean).join(' '));
  return [...new Set(concepts.flatMap(group => group.variants))].slice(0, 32);
}

function containsVariant(value: string, variant: string): boolean {
  const haystack = searchable(value);
  const needle = searchable(variant);
  if (!haystack || !needle) return false;
  if (haystack === needle || haystack.includes(needle)) return true;

  const haystackWords = haystack.split(' ');
  const needleWords = needle.split(' ');
  return needleWords.length === 1 && haystackWords.some(word => fuzzyEqual(word, needle));
}

function matchStrength(value: string, variants: string[], exactScore: number, partialScore: number): number {
  const haystack = searchable(value);
  if (!haystack) return 0;
  if (variants.some(variant => haystack === searchable(variant))) return exactScore;
  if (variants.some(variant => containsVariant(haystack, variant))) return partialScore;
  return 0;
}

function conceptStrength(
  group: SearchGroup,
  candidate: { name: string; section?: string | null; aliases?: string[] },
): number {
  const name = candidate.name || '';
  const aliases = (candidate.aliases || []).join(' ');
  const section = candidate.section || '';

  let strength = Math.max(
    matchStrength(name, group.variants, 1, 0.92),
    matchStrength(aliases, group.variants, 0.94, 0.82),
    matchStrength(section, group.variants, 0.28, 0.22),
  );

  // Para conceitos compostos, permita que o nome da peça e a seção completem
  // a expressão. Ex.: nome "TAMBOR" + seção "CLUTCH" deve corresponder a
  // "tambor da embreagem", mas um PARAFUSO na seção CLUTCH não recebe o bônus.
  if (group.key === 'clutch-drum') {
    const nameHasDrum = ['tambor', 'drum'].some(term => containsVariant(name, term));
    const contextHasClutch = ['embreagem', 'embraiagem', 'clutch'].some(term => containsVariant(`${section} ${aliases}`, term));
    if (nameHasDrum && contextHasClutch) strength = Math.max(strength, 0.96);
  }

  if (group.key === 'starter-rope') {
    const nameHasRope = ['corda', 'rope'].some(term => containsVariant(name, term));
    const contextHasStarter = ['partida', 'arranque', 'starter', 'recoil'].some(term => containsVariant(`${section} ${aliases}`, term));
    if (nameHasRope && contextHasStarter) strength = Math.max(strength, 0.94);
  }

  if (group.key === 'fuel-hose') {
    const nameHasHose = ['mangueira', 'tubo', 'hose', 'pipe', 'line'].some(term => containsVariant(name, term));
    const contextHasFuel = ['combustivel', 'fuel', 'gasolina'].some(term => containsVariant(`${section} ${aliases}`, term));
    if (nameHasHose && contextHasFuel) strength = Math.max(strength, 0.94);
  }

  return strength;
}

export function scorePartText(
  query: string,
  candidate: { name: string; section?: string | null; aliases?: string[] },
): number {
  const groups = buildSearchGroups(query);
  if (!groups.length) return 0;

  let total = 0;
  for (const group of groups) total += conceptStrength(group, candidate);
  return Math.max(0, Math.min(1, total / groups.length));
}

/**
 * Quando existem correspondências fortes pelo nome/alias, remove itens que
 * apareceram apenas por pertencerem à mesma seção da vista explodida.
 */
export function focusCandidatesByDescription<
  T extends { name: string; section?: string | null; alternativeNames?: string[] },
>(query: string, candidates: T[]): T[] {
  const scored = candidates.map(candidate => ({
    candidate,
    score: scorePartText(query, {
      name: candidate.name,
      section: candidate.section,
      aliases: candidate.alternativeNames,
    }),
  }));
  const directMatches = scored.filter(item => item.score >= 0.85);
  return directMatches.length ? directMatches.map(item => item.candidate) : candidates;
}

export function vocabularyEntry(key: string): SearchGroup | null {
  const entry = ENTRY_BY_KEY.get(key);
  return entry ? { key: entry.key, variants: normalizedVariants(entry) } : null;
}
