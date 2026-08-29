import { normalizeText } from '../utils/normalize';

export const CATALOG_CATEGORY_NAMES = [
    'Roçadeiras',
    'Motosserras',
    'Tratores',
    'Cortadores de grama',
    'Giro zero',
    'Sopradores',
    'Motores',
    'Pulverizadores',
    'Podadores',
    'Multifuncionais',
    'Aparadores de cerca-viva',
    'Rider / cortadores frontais',
    'Automower',
    'Outros / Não identificado',
] as const;

export type CatalogCategoryName = typeof CATALOG_CATEGORY_NAMES[number];

type CategoryPart = {
    name?: string | null;
    section?: string | null;
    notes?: string | null;
};

type CatalogCategoryInput = {
    filename?: string | null;
    model?: string | null;
    models?: Array<string | null | undefined>;
    parts?: CategoryPart[];
};

function normalized(value: string | null | undefined): string {
    return normalizeText(value || '');
}

function scoreText(text: string, terms: string[], weight: number): number {
    return terms.reduce((score, term) => score + (text.includes(normalized(term)) ? weight : 0), 0);
}

function modelScore(models: string[], pattern: RegExp, weight: number): number {
    return models.some((model) => pattern.test(model.replace(/\s+/g, '').toUpperCase())) ? weight : 0;
}

/**
 * Classifica a família técnica do catálogo usando somente evidências do próprio
 * documento (nome do arquivo, modelo e nomenclatura extraída). A classificação
 * organiza a biblioteca; ela nunca cria aplicação de peça nem interfere no
 * modelo/PNC usados pela busca técnica.
 */
export function inferCatalogCategory(input: CatalogCategoryInput): CatalogCategoryName {
    const filename = normalized(input.filename);
    const models = [input.model, ...(input.models || [])]
        .map((model) => (model || '').trim())
        .filter(Boolean);
    const modelText = normalized(models.join(' '));
    const partsText = normalized((input.parts || [])
        .slice(0, 500)
        .map((part) => [part.section, part.name, part.notes].filter(Boolean).join(' '))
        .join(' '));
    const text = `${filename} ${modelText} ${partsText}`;

    const scores = new Map<CatalogCategoryName, number>();
    const add = (category: CatalogCategoryName, value: number) => {
        scores.set(category, (scores.get(category) || 0) + value);
    };

    // Nome do arquivo costuma vir diretamente do título do Portal/IPL e por isso
    // recebe peso alto. Os termos técnicos abaixo servem como fallback.
    add('Roçadeiras', scoreText(filename, ['roçadeira', 'rocadeira', 'brushcutter', 'trimmer'], 8));
    add('Motosserras', scoreText(filename, ['motosserra', 'chainsaw'], 8));
    add('Tratores', scoreText(filename, ['trator', 'tractor'], 8));
    add('Cortadores de grama', scoreText(filename, ['cortador de grama', 'lawn mower', 'lawnmower'], 8));
    add('Giro zero', scoreText(filename, ['giro zero', 'zero turn', 'zero-turn'], 10));
    add('Sopradores', scoreText(filename, ['soprador', 'blower'], 8));
    add('Motores', scoreText(filename, ['motor husqvarna', 'engine'], 8));
    add('Pulverizadores', scoreText(filename, ['pulverizador', 'sprayer'], 8));
    add('Podadores', scoreText(filename, ['podador', 'pole saw', 'polesaw'], 10));
    add('Multifuncionais', scoreText(filename, ['multifuncional', 'combi', 'engine unit'], 10));
    add('Aparadores de cerca-viva', scoreText(filename, ['cerca viva', 'cerca-viva', 'hedge trimmer'], 10));
    add('Rider / cortadores frontais', scoreText(filename, ['rider', 'cortador frontal', 'front mower'], 10));
    add('Automower', scoreText(filename, ['automower', 'robotic mower'], 10));

    const compactModels = models.map((model) => model.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
    add('Tratores', modelScore(compactModels, /^TS\d/, 7));
    add('Giro zero', modelScore(compactModels, /^(MZ\d|Z\d{3})/, 7));
    add('Motores', modelScore(compactModels, /^(HS|HV)\d/, 9));
    add('Podadores', modelScore(compactModels, /^525P/, 10));
    add('Multifuncionais', modelScore(compactModels, /^525LK/, 10));
    add('Aparadores de cerca-viva', modelScore(compactModels, /^\d{3}HD/, 9));
    add('Rider / cortadores frontais', modelScore(compactModels, /^R\d{3}T/, 9));
    add('Cortadores de grama', modelScore(compactModels, /^(LC\d|LB\d|HU\d|J55|GX560)/, 6));
    add('Sopradores', modelScore(compactModels, /^(125B|\d{3}(BT|BTF|BF))$/, 8));
    add('Roçadeiras', modelScore(compactModels, /^\d{3}(R|RII|RS)/, 8));

    // Arquitetura mecânica observada nos IPLs analisados. Combinações recebem
    // pontos em vez de um único termo genérico para evitar falsos positivos.
    const has = (term: string) => text.includes(normalized(term));
    if (has('chain brake') || has('freio da corrente')) add('Motosserras', 4);
    if ((has('guide bar') || has('sabre')) && (has('saw chain') || has('corrente'))) add('Motosserras', 5);
    if ((has('volute') || has('scroll') || has('voluta')) && (has('impeller') || has('ventoinha'))) add('Sopradores', 7);
    if ((has('lance') || has('lança')) && has('nozzle')) add('Pulverizadores', 7);
    if ((has('pump piston') || has('pistão da bomba')) && has('pressure hose')) add('Pulverizadores', 6);
    if (has('caster') && (has('lh') || has('rh')) && has('deck')) add('Giro zero', 7);
    if ((has('grassbag') || has('mulcher door') || has('rear skirt')) && has('blade')) add('Cortadores de grama', 6);
    if (has('steering') && has('deck') && has('seat') && has('transmission')) add('Tratores', 5);
    if ((has('drive shaft') || has('eixo motriz')) && (has('bevel gear') || has('engrenagem cônica'))) add('Roçadeiras', 5);
    if ((has('cutting head') || has('cabeça de corte')) && (has('guide bar') || has('sabre')) && has('drive shaft')) add('Podadores', 8);
    if (has('connecting rod') && has('gear wheel') && has('cutting equipment')) add('Aparadores de cerca-viva', 6);
    if (has('governor') && has('crankshaft') && has('rocker arm') && !has('deck') && !has('guide bar')) add('Motores', 5);

    let winner: CatalogCategoryName = 'Outros / Não identificado';
    let bestScore = 0;
    for (const category of CATALOG_CATEGORY_NAMES) {
        const score = scores.get(category) || 0;
        if (score > bestScore) {
            bestScore = score;
            winner = category;
        }
    }

    return bestScore >= 5 ? winner : 'Outros / Não identificado';
}

export function isCatalogCategoryName(value: unknown): value is CatalogCategoryName {
    return typeof value === 'string' && CATALOG_CATEGORY_NAMES.includes(value as CatalogCategoryName);
}
