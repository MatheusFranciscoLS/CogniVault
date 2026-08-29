import { normalizeText } from '../utils/normalize';

type VocabularyEntry = {
  key: string;
  terms: string[];
};

export type SearchGroup = {
  key: string;
  variants: string[];
};

export type PartQueryRelation = {
  primary: SearchGroup;
  context: SearchGroup;
};

const STOP_WORDS = new Set([
  'a', 'ao', 'aos', 'as', 'codigo', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'equipamento', 'essa', 'esse', 'esta', 'este', 'favor', 'maquina', 'modelo', 'na', 'nas',
  'no', 'nos', 'o', 'os', 'para', 'peca', 'pelo', 'por', 'preciso', 'qual', 'que', 'quero',
  'pnc', 'uma', 'um', 'husqvarna', 'stihl', 'honda', 'kawashima', 'toyama',
  'rocadeira', 'roçadeira', 'motosserra', 'aparador', 'cortador', 'trator', 'soprador', 'automower',
  'podador', 'giro', 'zero', 'jardim', 'grama', 'relva',
]);

const QUERY_MODIFIERS = new Set([
  'completa', 'completo', 'conjunto', 'conjunto completo', 'assy', 'assembly',
  'peca completa', 'peça completa', 'inteira', 'inteiro',
]);

// Componentes que podem ser pedidos dentro de um conjunto: "parafuso da embreagem",
// "mola do defletor", "porca do sabre". O componente é o alvo principal e o
// segundo conceito vira contexto da vista/conjunto.
const RELATIONAL_PRIMARY_KEYS = new Set([
  'screw', 'nut', 'washer', 'spring', 'bearing', 'needle-bearing', 'bushing', 'spacer', 'pin',
  'bracket', 'clamp', 'seal', 'gasket', 'o-ring', 'cover', 'housing', 'lever', 'latch', 'drum',
  'pulley', 'idler-pulley', 'wheel', 'tire', 'connector', 'switch', 'sensor', 'gear',
]);

// Ontologia de balcão: une nomenclatura Husqvarna BR/PT, inglês técnico de IPLs e
// termos funcionais usados em assistência/revenda. Ela só aproxima linguagem;
// código, modelo, PNC, posição e aplicação continuam vindo da evidência técnica.
const VOCABULARY: VocabularyEntry[] = [
  // Admissão, combustível e motor
  { key: 'air-filter', terms: ['filtro de ar', 'filtro ar', 'air filter', 'airfilter', 'elemento filtrante', 'elemento do filtro de ar'] },
  { key: 'fuel-filter', terms: ['filtro de combustivel', 'filtro combustível', 'filtro combustivel', 'filtro de gasolina', 'pescador de combustivel', 'pescador de combustível', 'pescador do tanque', 'fuel filter', 'fuel pickup'] },
  { key: 'oil-filter', terms: ['filtro de oleo', 'filtro de óleo', 'filtro oleo', 'oil filter'] },
  { key: 'carburettor', terms: ['carburador', 'carburador completo', 'carburettor', 'carburetor', 'carburettor assy', 'carburetor assy', 'carburettor assembly', 'carburetor assembly'] },
  { key: 'fuel-pump', terms: ['bomba de combustivel', 'bomba de combustível', 'bomba combustivel', 'bomba de gasolina', 'fuel pump'] },
  { key: 'fuel-tank', terms: ['tanque de combustivel', 'tanque de combustível', 'tanque combustivel', 'tanque de gasolina', 'deposito de combustivel', 'depósito de combustível', 'fuel tank'] },
  { key: 'fuel-hose', terms: ['mangueira de combustivel', 'mangueira de combustível', 'mangueira combustivel', 'mangueira de gasolina', 'tubo de combustivel', 'tubo de combustível', 'fuel hose', 'fuel pipe', 'fuel line'] },
  { key: 'fuel-cap', terms: ['tampa do tanque', 'tampa tanque', 'tampa de combustivel', 'tampa de combustível', 'tampa do deposito', 'tampa do depósito', 'fuel cap', 'tank cap'] },
  { key: 'air-purge', terms: ['bulbo primer', 'bulbo de combustivel', 'bulbo de combustível', 'bombinha primer', 'primer', 'air purge', 'purge bulb'] },
  { key: 'diaphragm', terms: ['diafragma', 'membrana', 'diaphragm'] },
  { key: 'choke', terms: ['afogador', 'choke'] },
  { key: 'throttle-cable', terms: ['cabo do acelerador', 'cabo acelerador', 'cabo de acelerador', 'throttle cable'] },
  { key: 'throttle', terms: ['acelerador', 'gatilho do acelerador', 'gatilho', 'throttle', 'trigger'] },
  { key: 'cylinder', terms: ['cilindro', 'cylinder'] },
  { key: 'piston-ring', terms: ['anel do pistao', 'anel do pistão', 'anel pistao', 'segmento do pistao', 'segmento do pistão', 'piston ring'] },
  { key: 'piston', terms: ['pistao', 'pistão', 'piston', 'piston assy', 'conjunto do pistao', 'conjunto do pistão', 'conj do pistao'] },
  { key: 'crankshaft', terms: ['virabrequim', 'cambota', 'crankshaft'] },
  { key: 'crankcase', terms: ['carcaca do motor', 'carcaça do motor', 'bloco do motor', 'carter', 'cárter', 'crankcase', 'engine housing'] },
  { key: 'muffler', terms: ['escapamento', 'silencioso', 'silenciador', 'mufla', 'muffler', 'silencer', 'exhaust'] },

  // Ignição e partida
  { key: 'spark-plug', terms: ['vela de ignicao', 'vela de ignição', 'vela ignicao', 'vela', 'spark plug', 'sparkplug'] },
  { key: 'spark-plug-cap', terms: ['cachimbo da vela', 'cachimbo vela', 'terminal da vela', 'capuz da vela', 'spark plug cap', 'plug cap'] },
  { key: 'ignition', terms: ['bobina de ignicao', 'bobina de ignição', 'bobina ignicao', 'bobine de ignicao', 'bobine de ignição', 'modulo de ignicao', 'módulo de ignição', 'magneto de ignicao', 'ignition coil', 'ignition module', 'ignition'] },
  { key: 'flywheel', terms: ['volante magnetico', 'volante magnético', 'volante do motor', 'magneto', 'flywheel'] },
  { key: 'starter', terms: ['partida retratil', 'partida retrátil', 'arranque', 'retratil', 'retrátil', 'recoil starter', 'starter housing', 'starter', 'arranque completo'] },
  { key: 'starter-rope', terms: ['corda de partida', 'corda partida', 'cordao de partida', 'cordão de partida', 'corda de arranque', 'starter rope', 'recoil rope', 'rope'] },
  { key: 'starter-pulley', terms: ['polia de partida', 'polia do arranque', 'carretel de partida', 'carretel do arranque', 'starter pulley', 'recoil pulley'] },
  { key: 'recoil-spring', terms: ['mola de partida', 'mola do arranque', 'mola de recuo', 'mola retratil', 'mola retrátil', 'recoil spring', 'starter spring'] },
  { key: 'starter-motor', terms: ['motor de partida', 'motor de arranque', 'motor partida', 'starter motor', 'electric starter'] },

  // Embreagem e transmissão
  { key: 'drum', terms: ['tambor', 'copo', 'campana', 'drum'] },
  {
    key: 'clutch',
    terms: [
      'embreagem', 'embraiagem', 'clutch',
      'embreagem completa', 'embraiagem completa', 'conjunto de embreagem', 'conjunto da embreagem',
      'conjunto de embraiagem', 'conjunto da embraiagem', 'clutch assy', 'clutch assembly', 'complete clutch',
    ],
  },
  { key: 'electric-clutch', terms: ['embreagem eletrica', 'embreagem elétrica', 'embreagem do pto', 'embreagem da tomada de forca', 'embreagem da tomada de força', 'pto clutch', 'electric clutch', 'blade clutch'] },
  { key: 'gearbox', terms: ['caixa de transmissao', 'caixa de transmissão', 'caixa de engrenagem', 'caixa de engrenagens', 'ponteira', 'ponteira da rocadeira', 'ponteira da roçadeira', 'engrenagem conica', 'engrenagem cônica', 'bevel gear', 'angle gear', 'gearbox', 'gear box'] },
  { key: 'transaxle', terms: ['transaxle', 'transmissao hidrostatica', 'transmissão hidrostática', 'cambio hidrostatico', 'câmbio hidrostático', 'caixa hidrostatica', 'caixa hidrostática', 'hydrostatic transmission', 'hydro gear'] },
  { key: 'gear', terms: ['engrenagem', 'carreto', 'gear'] },
  { key: 'worm-gear', terms: ['engrenagem sem fim', 'engrenagem sem-fim', 'rosca sem fim', 'rosca sem-fim', 'worm gear'] },
  { key: 'shaft', terms: ['eixo', 'veio', 'shaft', 'drive shaft', 'eixo de transmissao', 'eixo de transmissão'] },
  { key: 'tube', terms: ['tubo', 'haste', 'tube', 'shaft tube'] },
  { key: 'drive-belt', terms: ['correia', 'correia de transmissao', 'correia de transmissão', 'correia do deck', 'correia da plataforma', 'drive belt', 'deck belt', 'belt'] },
  { key: 'pulley', terms: ['polia', 'roldana', 'pulley'] },
  { key: 'idler-pulley', terms: ['polia tensora', 'polia tensionadora', 'polia guia', 'polia de retorno', 'esticador da correia', 'tensor da correia', 'idler pulley', 'tension pulley', 'belt idler'] },
  { key: 'spindle', terms: ['mandril da lamina', 'mandril da lâmina', 'eixo da lamina', 'eixo da lâmina', 'mancal da lamina', 'mancal da lâmina', 'spindle', 'blade spindle'] },
  { key: 'axle', terms: ['eixo da roda', 'eixo traseiro', 'eixo dianteiro', 'axle'] },

  // Corte: roçadeiras, cortadores, tratores e Automower
  { key: 'trimmer-head', terms: ['cabecote de nylon', 'cabeçote de nylon', 'cabecote de corte', 'cabeçote de corte', 'carretel', 'carretel de nylon', 'cabeça de corte', 'trimmer head', 'cutting head'] },
  { key: 'trimmer-line', terms: ['fio de nylon', 'nylon', 'linha de corte', 'fio de corte', 'trimmer line', 'cutting line'] },
  { key: 'blade', terms: ['lamina', 'lâmina', 'faca', 'navalha', 'blade', 'knife'] },
  { key: 'blade-set', terms: ['jogo de laminas', 'jogo de lâminas', 'kit de laminas', 'kit de lâminas', 'blade set', 'blade kit'] },
  { key: 'blade-adapter', terms: ['adaptador da lamina', 'adaptador da lâmina', 'suporte da lamina', 'suporte da lâmina', 'blade adapter'] },
  { key: 'blade-flange', terms: ['flange da lamina', 'flange da lâmina', 'arruela de apoio da lamina', 'arruela de apoio da lâmina', 'acionador da lamina', 'acionador da lâmina', 'drive disc', 'support flange', 'blade flange'] },
  { key: 'blade-cup', terms: ['copo da lamina', 'copo da lâmina', 'copinho da lamina', 'copinho da lâmina', 'prato da lamina', 'prato da lâmina', 'support cup', 'blade cup'] },
  { key: 'cutting-deck', terms: ['deck', 'plataforma de corte', 'unidade de corte', 'carcaca do deck', 'carcaça do deck', 'cutter deck', 'cutting deck', 'mower deck'] },
  { key: 'cutting-disc', terms: ['disco cortador', 'disco de corte', 'disco de laminas', 'disco de lâminas', 'cutting disc', 'blade disc'] },
  { key: 'skid-plate', terms: ['placa de deslize', 'placa deslizante', 'placa derrapante', 'skid plate', 'sliding plate'] },
  {
    key: 'discharge-deflector',
    terms: [
      'saia lateral', 'saia lateral do deck', 'defletor', 'defletor lateral', 'defletor de descarga',
      'defletor de descarga lateral', 'calha lateral', 'calha de descarga', 'calha de descarga lateral',
      'bica lateral', 'bica de descarga', 'saida lateral', 'saída lateral', 'chute lateral',
      'side discharge chute', 'discharge chute', 'discharge deflector', 'grass deflector',
    ],
  },
  { key: 'rear-skirt', terms: ['saia traseira', 'saia de tras', 'saia de trás', 'aba traseira', 'rear skirt', 'rear flap'] },
  { key: 'grass-collector', terms: ['coletor de grama', 'coletor de relva', 'cesto coletor', 'saco coletor', 'recolhedor de grama', 'grass collector', 'grass catcher', 'bagger', 'grass bag'] },
  { key: 'mulch-plug', terms: ['tampa mulch', 'tampao mulch', 'tampão mulch', 'bujão mulch', 'plug mulch', 'kit mulch', 'mulch plug', 'mulching plug', 'bio clip plug', 'bioclip plug'] },
  { key: 'deck-wheel', terms: ['roda do deck', 'roda da plataforma', 'rodinha do deck', 'roda antiescalpelamento', 'roda anti escalpelamento', 'anti scalp wheel', 'anti-scalp wheel', 'deck wheel'] },
  { key: 'deck-lift', terms: ['elevador do deck', 'levantamento do deck', 'alavanca de altura de corte', 'alavanca de elevacao', 'alavanca de elevação', 'deck lift', 'cutting height lever'] },
  { key: 'pto-switch', terms: ['botao pto', 'botão pto', 'interruptor pto', 'chave pto', 'botao da tomada de forca', 'botão da tomada de força', 'interruptor da tomada de forca', 'pto switch', 'blade engagement switch'] },
  { key: 'guard', terms: ['protecao', 'proteção', 'protetor', 'guarda', 'protection', 'guard', 'shield'] },
  { key: 'harness', terms: ['cinturao', 'cinturão', 'arnes', 'suspensorio', 'suspensório', 'harness'] },

  // Motosserras
  { key: 'chain', terms: ['corrente', 'corrente de corte', 'saw chain', 'chain'] },
  { key: 'guide-bar', terms: ['sabre', 'barra guia', 'barra-guia', 'barra da motosserra', 'guia da corrente', 'guide bar', 'bar'] },
  { key: 'bar-nut', terms: ['porca do sabre', 'porca da barra', 'porca da tampa da embreagem', 'bar nut', 'guide bar nut'] },
  { key: 'sprocket', terms: ['pinhao', 'pinhão', 'pinhao da corrente', 'pinhão da corrente', 'coroa', 'sprocket', 'rim sprocket', 'drive sprocket'] },
  { key: 'oil-pump', terms: ['bomba de oleo', 'bomba de óleo', 'bomba lubrificacao', 'bomba de lubrificação', 'oil pump'] },
  { key: 'chain-brake', terms: ['freio da corrente', 'travao da corrente', 'travão da corrente', 'chain brake'] },
  { key: 'chain-catcher', terms: ['pega corrente', 'captor de corrente', 'pino pega corrente', 'chain catcher'] },
  { key: 'chain-tensioner', terms: ['tensor da corrente', 'esticador da corrente', 'tensionador da corrente', 'parafuso esticador da corrente', 'chain tensioner', 'chain adjuster'] },
  { key: 'chain-cover', terms: ['tampa da corrente', 'tampa lateral', 'tampa do pinhao', 'tampa do pinhão', 'cobertura da embreagem', 'clutch cover', 'chain cover', 'sprocket cover'] },
  { key: 'spike-bumper', terms: ['garra', 'garra de apoio', 'garra de abate', 'batente de garra', 'spike bumper', 'bucking spike', 'felling spike'] },

  // Sopradores e ventilação
  { key: 'fan', terms: ['ventoinha', 'ventilador', 'turbina', 'rotor do soprador', 'impeller', 'fan'] },
  { key: 'blower-tube', terms: ['tubo do soprador', 'tubo soprador', 'blower tube'] },
  { key: 'nozzle', terms: ['bico', 'bocal', 'ponteira do soprador', 'nozzle'] },

  // Elétrico, bateria e Automower
  { key: 'battery', terms: ['bateria', 'acumulador', 'battery'] },
  { key: 'charger', terms: ['carregador', 'carregador de bateria', 'charger', 'battery charger'] },
  { key: 'charging-contact', terms: ['contato de carga', 'contacto de carga', 'terminal de carga', 'placa de carga', 'charging contact', 'charging strip', 'charging plate'] },
  { key: 'electric-motor', terms: ['motor eletrico', 'motor elétrico', 'electric motor', 'motor assy'] },
  { key: 'blade-motor', terms: ['motor da lamina', 'motor da lâmina', 'motor de corte', 'cutter motor', 'cutter motor assy', 'blade motor'] },
  { key: 'wheel-motor', terms: ['motor da roda', 'motor de tracao', 'motor de tração', 'wheel motor', 'drive motor'] },
  { key: 'circuit-board', terms: ['placa eletronica', 'placa eletrônica', 'placa de circuito', 'placa principal', 'main board', 'circuit board', 'pcb'] },
  { key: 'wiring', terms: ['chicote', 'chicote eletrico', 'chicote elétrico', 'fiacao', 'fiação', 'wiring harness', 'wire harness', 'wiring'] },
  { key: 'connector', terms: ['conector', 'terminal eletrico', 'terminal elétrico', 'connector'] },
  { key: 'sensor', terms: ['sensor', 'sensor assy'] },
  { key: 'switch', terms: ['interruptor', 'chave', 'botao', 'botão', 'switch'] },
  { key: 'keypad', terms: ['teclado', 'painel de teclas', 'keypad'] },
  { key: 'display', terms: ['display', 'visor', 'tela', 'ecra', 'ecrã'] },

  // Rodagem, comando, chassi e tratores
  { key: 'wheel', terms: ['roda', 'rodinha', 'wheel'] },
  { key: 'tire', terms: ['pneu', 'tire', 'tyre'] },
  { key: 'handle', terms: ['guidao', 'guidão', 'alca', 'alça', 'punho', 'pega', 'manete', 'handle', 'handlebar', 'grip'] },
  { key: 'brake', terms: ['freio', 'travao', 'travão', 'brake'] },
  { key: 'seat', terms: ['banco', 'assento', 'seat'] },
  { key: 'steering-wheel', terms: ['volante de direcao', 'volante de direção', 'volante do trator', 'steering wheel'] },
  { key: 'steering-link', terms: ['barra de direcao', 'barra de direção', 'tirante de direcao', 'tirante de direção', 'barra axial', 'tie rod', 'steering link', 'drag link'] },
  { key: 'hood', terms: ['capo', 'capô', 'capot', 'tampa do motor', 'hood', 'bonnet'] },
  { key: 'fender', terms: ['paralama', 'para-lama', 'paralamas', 'para-lamas', 'fender', 'mudguard'] },
  { key: 'chassis', terms: ['chassi', 'chassis', 'quadro principal', 'main frame', 'frame'] },

  // Aparadores de cerca viva
  { key: 'cutter-bar', terms: ['barra de corte', 'barra de laminas', 'barra de lâminas', 'conjunto de laminas', 'conjunto de lâminas', 'cutter bar', 'cutter blade assy', 'blade assembly'] },

  // Elementos mecânicos genéricos
  { key: 'bearing', terms: ['rolamento', 'rolamento de esferas', 'mancal', 'bearing', 'ball bearing'] },
  { key: 'needle-bearing', terms: ['rolamento de agulha', 'rolamento de agulhas', 'gaiola de agulhas', 'needle bearing', 'needle cage'] },
  { key: 'bushing', terms: ['bucha', 'casquilho', 'bushing', 'bush'] },
  { key: 'spacer', terms: ['espacador', 'espaçador', 'distanciador', 'spacer'] },
  { key: 'pin', terms: ['pino', 'cavilha', 'pin'] },
  { key: 'lever', terms: ['alavanca', 'manete', 'lever'] },
  { key: 'latch', terms: ['trava', 'trinco', 'fecho', 'latch'] },
  { key: 'cover', terms: ['tampa', 'cobertura', 'capa', 'cover', 'cap'] },
  { key: 'housing', terms: ['carcaca', 'carcaça', 'alojamento', 'corpo', 'housing'] },
  { key: 'seal', terms: ['retentor', 'vedacao', 'vedação', 'vedante', 'selo', 'seal', 'sealing'] },
  { key: 'gasket', terms: ['junta', 'junta de vedacao', 'junta de vedação', 'gasket'] },
  { key: 'o-ring', terms: ['anel o', 'anel de vedacao', 'anel de vedação', 'o-ring', 'oring', 'o ring'] },
  { key: 'screw', terms: ['parafuso', 'screw', 'bolt', 'parafuso sextavado', 'parafuso allen'] },
  { key: 'nut', terms: ['porca', 'porca sextavada', 'nut'] },
  { key: 'washer', terms: ['arruela', 'anilha', 'washer'] },
  { key: 'spring', terms: ['mola', 'spring'] },
  { key: 'bracket', terms: ['suporte', 'apoio', 'bracket', 'support'] },
  { key: 'clamp', terms: ['abracadeira', 'abraçadeira', 'grampo', 'clamp', 'clip'] },
  { key: 'filter', terms: ['filtro', 'filter'] },
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
  return [...concepts, ...literals].slice(0, 8);
}

function conceptOccurrences(value: string): Array<{ group: SearchGroup; index: number; end: number; length: number }> {
  const query = searchable(value);
  const queryWords = query.split(' ');
  const matches: Array<{ group: SearchGroup; index: number; end: number; length: number }> = [];

  for (const entry of VOCABULARY) {
    let best: { index: number; end: number; length: number } | null = null;
    for (const term of normalizedVariants(entry)) {
      const needle = searchable(term);
      if (!needle) continue;
      const needleWords = needle.split(' ');
      for (let wordIndex = 0; wordIndex <= queryWords.length - needleWords.length; wordIndex += 1) {
        const window = queryWords.slice(wordIndex, wordIndex + needleWords.length).join(' ');
        if (window !== needle) continue;
        const prefix = queryWords.slice(0, wordIndex).join(' ');
        const index = prefix ? prefix.length + 1 : 0;
        const candidate = { index, end: index + needle.length, length: needle.length };
        if (!best || index < best.index || (index === best.index && needle.length > best.length)) best = candidate;
        break;
      }
    }
    if (best) matches.push({ group: { key: entry.key, variants: normalizedVariants(entry) }, ...best });
  }

  return matches.sort((a, b) => a.index - b.index || b.length - a.length);
}

export function inferPartQueryRelation(value: string): PartQueryRelation | null {
  const query = searchable(value);
  const occurrences = conceptOccurrences(value);
  if (occurrences.length < 2) return null;

  for (let leftIndex = 0; leftIndex < occurrences.length - 1; leftIndex += 1) {
    const left = occurrences[leftIndex];
    if (!RELATIONAL_PRIMARY_KEYS.has(left.group.key)) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < occurrences.length; rightIndex += 1) {
      const right = occurrences[rightIndex];
      if (right.group.key === left.group.key || right.index < left.end) continue;
      const between = query.slice(left.end, right.index).trim();
      const connector = /^(?:d[aeo]s?|de|da|do|das|dos)?$/.test(between);
      if (connector || between === '') return { primary: left.group, context: right.group };
    }
  }
  return null;
}

export function semanticQueryText(value: string, ignoredValues: string[] = []): string {
  const groups = buildSearchGroups(value, ignoredValues);
  const variants = [...new Set(groups.flatMap(group => group.variants))].slice(0, 48);
  const relation = inferPartQueryRelation(value);
  const relationHint = relation
    ? `Peça procurada: ${relation.primary.variants.slice(0, 8).join(', ')}. Conjunto ou contexto: ${relation.context.variants.slice(0, 8).join(', ')}.`
    : '';
  if (!variants.length) return value.trim();
  return [value.trim(), `Equivalentes técnicos: ${variants.join(', ')}`, relationHint].filter(Boolean).join('\n');
}

function compactRelationAliases(primary: SearchGroup, context: SearchGroup): string[] {
  const primaryTerms = primary.variants.filter(term => words(term).length <= 3).slice(0, 5);
  const contextTerms = context.variants.filter(term => words(term).length <= 4).slice(0, 6);
  const aliases: string[] = [];
  for (const primaryTerm of primaryTerms) {
    for (const contextTerm of contextTerms) {
      aliases.push(`${primaryTerm} ${contextTerm}`);
      aliases.push(`${primaryTerm} de ${contextTerm}`);
    }
  }
  return aliases;
}

/**
 * Cria termos SOMENTE para recuperação/embedding a partir da peça e da vista reais.
 * Eles não viram nomes oficiais no banco. Isso ensina relações como SCREW em CLUTCH
 * -> "parafuso embreagem" sem inventar código ou aplicação.
 */
export function inferredSearchAliases(name: string, section = '', aliases: string[] = []): string[] {
  const nameConcepts = findPartConcepts([name, ...aliases].filter(Boolean).join(' '));
  const sectionConcepts = findPartConcepts(section);
  const values = new Set<string>();

  for (const group of [...nameConcepts, ...sectionConcepts]) {
    for (const variant of group.variants) values.add(variant);
  }

  const primaryConcepts = nameConcepts.filter(group => RELATIONAL_PRIMARY_KEYS.has(group.key));
  for (const primary of primaryConcepts.slice(0, 2)) {
    for (const context of sectionConcepts.filter(group => group.key !== primary.key).slice(0, 3)) {
      for (const alias of compactRelationAliases(primary, context)) values.add(alias);
    }
  }

  return [...values].filter(Boolean).slice(0, 80);
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

function nameStrength(group: SearchGroup, candidate: { name: string; aliases?: string[] }): number {
  return Math.max(
    matchStrength(candidate.name || '', group.variants, 1, 0.94),
    matchStrength((candidate.aliases || []).join(' '), group.variants, 0.96, 0.86),
  );
}

function contextStrength(group: SearchGroup, candidate: { name: string; section?: string | null; aliases?: string[] }): number {
  return Math.max(
    matchStrength(candidate.section || '', group.variants, 0.98, 0.92),
    matchStrength((candidate.aliases || []).join(' '), group.variants, 0.92, 0.82),
    matchStrength(candidate.name || '', group.variants, 0.86, 0.72),
  );
}

function conceptStrength(
  group: SearchGroup,
  candidate: { name: string; section?: string | null; aliases?: string[] },
): number {
  let strength = Math.max(
    nameStrength(group, candidate),
    matchStrength(candidate.section || '', group.variants, 0.28, 0.22),
  );

  if (group.key === 'starter-rope') {
    const nameHasRope = ['corda', 'cordao', 'rope'].some(term => containsVariant(candidate.name, term));
    const contextHasStarter = ['partida', 'arranque', 'starter', 'recoil'].some(term => containsVariant(`${candidate.section || ''} ${(candidate.aliases || []).join(' ')}`, term));
    if (nameHasRope && contextHasStarter) strength = Math.max(strength, 0.94);
  }

  if (group.key === 'fuel-hose') {
    const nameHasHose = ['mangueira', 'tubo', 'hose', 'pipe', 'line'].some(term => containsVariant(candidate.name, term));
    const contextHasFuel = ['combustivel', 'fuel', 'gasolina'].some(term => containsVariant(`${candidate.section || ''} ${(candidate.aliases || []).join(' ')}`, term));
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
  const regularScore = Math.max(0, Math.min(1, total / groups.length));

  const relation = inferPartQueryRelation(query);
  if (!relation) return regularScore;

  const primary = nameStrength(relation.primary, candidate);
  const context = contextStrength(relation.context, candidate);
  if (primary < 0.6 || context < 0.2) return regularScore;

  const relationScore = primary * 0.72 + context * 0.28;
  return Math.max(regularScore, Math.min(1, relationScore));
}

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
