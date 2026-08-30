export type CatalogSectionEvidence = {
  name: string;
  comments?: string | null;
};

type Rule = {
  section: string;
  patterns: Array<{ pattern: RegExp; weight: number }>;
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const RULES: Rule[] = [
  {
    section: 'CRANKCASE & CLUTCHDRUM',
    patterns: [
      { pattern: /\bcrankcase\b|\bcarter\b/, weight: 8 },
      { pattern: /\bflywheel\b|\bvolante\b/, weight: 4 },
      { pattern: /\bignition coil\b|\bbobina de ignicao\b/, weight: 4 },
      { pattern: /\bball bearing\b|\brolamento de esferas\b/, weight: 2 },
      { pattern: /\bclutch assy\b|\bconj de embre/i, weight: 2 },
    ],
  },
  {
    section: 'STARTER',
    patterns: [
      { pattern: /\bstarter\b|\bdispositivo de arranque\b/, weight: 7 },
      { pattern: /\bstarter handle\b|\bpunho de arranque\b/, weight: 5 },
      { pattern: /\bpulley\b|\broldana\b/, weight: 4 },
      { pattern: /\bpawl\b|\bgancho\b/, weight: 2 },
      { pattern: /\bcoil spring\b|\bmola da bobina\b/, weight: 3 },
      { pattern: /\bdriver\b|\bcondutor\b/, weight: 1 },
    ],
  },
  {
    section: 'CYLINDER PISTON',
    patterns: [
      { pattern: /\bcylinder\b|\bcilindro\b/, weight: 6 },
      { pattern: /\bpiston\b|\bpistao\b/, weight: 6 },
      { pattern: /\bpiston ring\b|\banel do pistao\b/, weight: 4 },
      { pattern: /\bspark plug\b|\bvela de ignicao\b/, weight: 2 },
      { pattern: /\bcrankshaft\b|\bvirabrequim\b/, weight: 1 },
    ],
  },
  {
    section: 'AIR FILTER',
    patterns: [
      { pattern: /\bair filter\b|\bfiltro de ar\b/, weight: 7 },
      { pattern: /\bcarburet(?:or|tor)\b|\bcarburettor\b|\bcarburador\b/, weight: 3 },
      { pattern: /\bintake\b|\badmissao\b/, weight: 2 },
    ],
  },
  {
    section: 'MUFFLER',
    patterns: [
      { pattern: /\bmuffler\b|\bsilenciador\b/, weight: 8 },
      { pattern: /\bspark arrestor\b|\btela de aprisionamento de faiscas\b/, weight: 3 },
    ],
  },
  {
    section: 'FUEL SYSTEM',
    patterns: [
      { pattern: /\bfuel tank\b|\bdeposito de combustivel\b/, weight: 6 },
      { pattern: /\bfuel filter\b|\bfiltro de combustivel\b/, weight: 5 },
      { pattern: /\bfuel hose\b|\bmangueira de combustivel\b/, weight: 4 },
      { pattern: /\btank cap\b|\btampa do deposito\b/, weight: 4 },
      { pattern: /\bfuel\b|\bcombustivel\b/, weight: 1 },
    ],
  },
  {
    section: 'HANDLE',
    patterns: [
      { pattern: /\bhandle\b|\bpunho\b|\bpega\b/, weight: 4 },
      { pattern: /\bthrottle\b|\bacelerador\b/, weight: 4 },
      { pattern: /\bswitch\b|\binterruptor\b/, weight: 2 },
      { pattern: /\bcorrugated pipe\b|\btubo corrugado\b/, weight: 1 },
    ],
  },
  {
    section: 'SHAFT',
    patterns: [
      { pattern: /\bdrive shaft\b|\beixo de transmissao\b/, weight: 5 },
      { pattern: /\bgear box\b|\bgearbox\b|\bcaixa de engrenagem\b/, weight: 4 },
      { pattern: /\bshaft\b|\beixo\b/, weight: 2 },
      { pattern: /\bguard\b|\bprotecao\b/, weight: 2 },
      { pattern: /\bblade\b|\blamina\b/, weight: 2 },
      { pattern: /\btrimmer head\b|\bcabecote do aparador\b/, weight: 3 },
      { pattern: /\btube assy\b|\btubo\b/, weight: 1 },
    ],
  },
  {
    section: 'CLUTCH',
    patterns: [
      { pattern: /\bclutch drum\b|\btambor de embre/i, weight: 7 },
      { pattern: /\bclutch\b|\bembre/i, weight: 4 },
      { pattern: /\bretainer ring\b|\banel de retencao\b/, weight: 1 },
      { pattern: /\bbearing\b|\brolamento\b/, weight: 1 },
    ],
  },
  {
    section: 'HOUSING',
    patterns: [
      { pattern: /\bhousing\b|\bcarcaca\b|\bcobertura\b/, weight: 6 },
    ],
  },
];

export function inferCatalogSection(rows: CatalogSectionEvidence[]): string {
  const evidence = normalize(rows.map(row => [row.name, row.comments].filter(Boolean).join(' ')).join(' '));
  if (!evidence) return '';

  let bestSection = '';
  let bestScore = 0;
  for (const rule of RULES) {
    let score = 0;
    for (const item of rule.patterns) {
      if (item.pattern.test(evidence)) score += item.weight;
    }
    if (score > bestScore) {
      bestScore = score;
      bestSection = rule.section;
    }
  }
  return bestScore >= 4 ? bestSection : '';
}
