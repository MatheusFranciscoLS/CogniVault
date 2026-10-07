// Leitor das MÁQUINAS da lista de preços da Husqvarna distribuída em .html (aba "Tabela de preços").
//
// Mesmo arquivo e mesma regra do `price-list-html.ts`: os dados estão em
// <script id="catalogData">, e aqui só se lê a lista `produtos` (as peças ficam lá). Função pura:
// recebe o texto, devolve o que leu e o que recusou; quem grava é o importador.
//
// O arquivo traz imagens em base64 e um aviso de propriedade intelectual. O leitor devolve a foto de cada
// máquina como bytes (dono, 2026-10-07: "cada máquina vigente tem que ter foto no orçamento"); quem grava é o
// importador, **no banco privado**, nunca no repositório (público). A ficha técnica é uma seleção conservadora: o arquivo é sujo (já
// vimos "rotação" com o valor de potência e "peso" com 6500), então valor com cara de erro fica
// de fora em vez de aparecer na tela do balcão como se fosse verdade.
import { normalizeIdentifier } from '../utils/normalize';
import { extractCatalogJson, parseBrlPrice } from './price-list-html';

export type MachineSpec = { label: string; value: string };

export type ListedMachine = {
  pnc: string;
  normalizedPnc: string;
  model: string;
  description: string;
  category: string;
  segment: string | null;
  technology: string | null;
  application: 'PROFISSIONAL' | 'COMERCIAL' | 'OCASIONAL' | null;
  /** PREÇO CONSUMIDOR da lista, como veio. Máquina não passa pela regra ÷ 0,92. */
  listPrice: number;
  discontinued: boolean;
  isNew: boolean;
  /** Preço da lista anterior, só quando mudou e o registro de mudança bate com o preço de hoje. */
  priceBefore: number | null;
  /** Posição na ordem que a própria Husqvarna define (tecnologia, categoria e ordem de exibição). */
  sortOrder: number;
  specs: MachineSpec[];
  details: string | null;
  /** Foto da própria lista (webp). Só o importador a lê; nunca vai para a tela da lista nem para o repositório. */
  photo: MachinePhoto | null;
};

export type MachinePhoto = { mime: string; data: Buffer };

export type RejectedMachine = { pnc: string; reason: 'SEM_PNC' | 'SEM_MODELO' | 'PRECO_INVALIDO' | 'PNC_REPETIDO' };

export type MachineList = {
  listDate: Date;
  machines: ListedMachine[];
  rejected: RejectedMachine[];
};

function cleanText(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const result = input.replace(/\s+/g, ' ').trim();
  return result && result !== '-' ? result : null;
}

const APPLICATIONS = ['PROFISSIONAL', 'COMERCIAL', 'OCASIONAL'] as const;

function parseApplication(input: unknown): ListedMachine['application'] {
  const text = cleanText(input)?.toUpperCase();
  return APPLICATIONS.find(item => item === text) ?? null;
}

/** "Texto" da descrição detalhada: o arquivo traz HTML (listas, <br>, spans de fonte). */
const HTML_ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

export function htmlToPlainLines(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  // Entidades numa passada só (decodificar `&amp;` antes de `&lt;` desfaria duas camadas de uma vez); depois as
  // tags saem até estabilizar, porque tirar uma tag pode juntar o resto numa nova. O texto vai para a tela como
  // texto puro, e `<`/`>` que sobrarem são descartados: nenhuma marcação sobrevive.
  let text = input
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/gi, (_match, name: string) => HTML_ENTITIES[name.toLowerCase()])
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    // Abertura e fechamento de bloco quebram a linha: "<ul><li>" sozinho colaria o item no texto anterior.
    .replace(/<\/?\s*(li|p|div|ul|ol)\b[^>]*>/gi, '\n');
  for (let previous = ''; previous !== text; ) {
    previous = text;
    text = text.replace(/<[^>]*>/g, '');
  }
  text = text.replace(/[<>]/g, '');
  const lines = text
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return lines.length ? lines.join('\n') : null;
}

type SpecRule = {
  field: string;
  label: string;
  /** Unidade que o arquivo costuma omitir e que só entra quando o valor é um número puro. */
  unit?: string;
  /** Número puro acima disto é gramas ou erro, não a unidade da etiqueta: fica de fora. */
  maxBare?: number;
};

// Só campos cujo valor lido não engana. Rotação, consumo, velocidade e produtividade ficaram de
// fora: no arquivo vêm trocados entre si ou sem unidade que dê para afirmar.
const SPEC_RULES: SpecRule[] = [
  { field: 'cilindrada', label: 'Cilindrada', unit: 'cm³', maxBare: 1000 },
  { field: 'potencia', label: 'Potência' },
  { field: 'tipo_motor', label: 'Motor' },
  { field: 'tipo_combustivel', label: 'Combustível' },
  { field: 'tanque_l', label: 'Tanque', unit: 'L', maxBare: 100 },
  { field: 'tipo_bateria', label: 'Bateria' },
  { field: 'volts', label: 'Tensão' },
  { field: 'largura_trabalho_cm', label: 'Largura de trabalho', unit: 'cm', maxBare: 500 },
  { field: 'nivel_ruido_dba', label: 'Ruído', unit: 'dB(A)', maxBare: 200 },
  { field: 'ipi', label: 'IPI', unit: '%', maxBare: 100 },
  { field: 'classif_fiscal', label: 'NCM' },
];

const BARE_NUMBER = /^\d+(?:[.,]\d+)?$/;

function bareNumberValue(text: string): number {
  // "9.000" vira 9000 (ponto de milhar); "4,4" vira 4.4. Sem milhar no arquivo além de rpm.
  return Number(/^\d{1,3}(?:\.\d{3})+$/.test(text) ? text.replace(/\./g, '') : text.replace(',', '.'));
}

const RIDE_ON = ['GIRO ZERO', 'TRATOR', 'RIDER', 'CORTADOR DE GRAMA'];

const upper = (text: string | null) => (text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

/**
 * Campos que só valem em certas categorias, porque no arquivo o mesmo campo muda de sentido (velocidade de
 * corrente de motosserra em km/h, "produtividade" sem unidade): transmissão e velocidade de quem se senta para
 * cortar grama; área e inclinação do robô. Valor com cara de erro fica de fora.
 */
export function buildCategorySpecs(row: Record<string, unknown>, category: string | null): MachineSpec[] {
  const specs: MachineSpec[] = [];
  const kind = upper(category);

  if (RIDE_ON.includes(kind)) {
    const transmission = cleanText(row.transmissao);
    // "Tuff Torq  K46 - Hidrostática" -> uma só vez cada espaço; valor numérico solto ("0,51") não é transmissão.
    if (transmission && /[A-Za-zÀ-ú]{4}/.test(transmission)) specs.push({ label: 'Transmissão', value: transmission });
    const speed = cleanText(row.velocidade_max_kmh);
    const bare = speed?.replace(/\s*km\/h$/i, '').replace(',', '.');
    if (speed && bare && /^\d{1,2}(?:\.\d+)?$/.test(bare) && Number(bare) > 0 && Number(bare) <= 30) {
      specs.push({ label: 'Velocidade máxima', value: `${bare.replace('.', ',')} km/h` });
    }
  }

  if (kind.startsWith('AUTOMOWER')) {
    const area = cleanText(row.capacidade_maxima_area);
    if (area && /\d\s*m²/.test(area)) specs.push({ label: 'Área de trabalho', value: area });
    const slope = cleanText(row.inclinacao_max_graus);
    if (slope && /\d/.test(slope)) specs.push({ label: 'Inclinação máxima', value: slope });
  }
  return specs;
}

const PHOTO_TYPES = ['image/webp', 'image/png', 'image/jpeg'];
const MAX_PHOTO_BYTES = 400_000;

/** Foto em data URL do dicionário `images` do arquivo, ou null se não for imagem comum e de tamanho razoável. */
export function readPhoto(images: unknown, key: unknown): MachinePhoto | null {
  if (!images || typeof images !== 'object' || typeof key !== 'string' || !key) return null;
  const value = (images as Record<string, unknown>)[key];
  if (typeof value !== 'string') return null;
  const match = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value);
  if (!match || !PHOTO_TYPES.includes(match[1].toLowerCase())) return null;
  const data = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  return data.length > 0 && data.length <= MAX_PHOTO_BYTES ? { mime: match[1].toLowerCase(), data } : null;
}

export function buildSpecs(row: Record<string, unknown>): MachineSpec[] {
  const specs: MachineSpec[] = [];
  for (const rule of SPEC_RULES) {
    const value = cleanText(row[rule.field]);
    if (!value) continue;
    if (BARE_NUMBER.test(value) || /^\d{1,3}(?:\.\d{3})+$/.test(value)) {
      if (!rule.unit) {
        specs.push({ label: rule.label, value });
        continue;
      }
      if (rule.maxBare !== undefined && bareNumberValue(value) > rule.maxBare) continue;
      specs.push({ label: rule.label, value: `${value} ${rule.unit}` });
      continue;
    }
    specs.push({ label: rule.label, value });
  }
  return [...specs, ...buildCategorySpecs(row, cleanText(row.categoria))];
}

type ListUpdate = { pnc: string; timestamp: string; wasNew: boolean; priceBefore: number | null; priceAfter: number | null };

function readUpdates(catalog: Record<string, unknown>): Map<string, ListUpdate> {
  const latest = new Map<string, ListUpdate>();
  const updates = Array.isArray(catalog.updates) ? (catalog.updates as Record<string, unknown>[]) : [];
  for (const item of updates) {
    if (item?.secKey !== 'produtos') continue;
    const pnc = normalizeIdentifier(cleanText(item.pnc));
    const timestamp = cleanText(item.timestamp);
    if (!pnc || !timestamp) continue;
    const current = latest.get(pnc);
    // "Nova" vale se QUALQUER registro da máquina diz "Novo": um ajuste posterior não a torna antiga.
    const wasNew = cleanText(item.status) === 'Novo' || current?.wasNew === true;
    if (current && current.timestamp >= timestamp) {
      current.wasNew = wasNew;
      continue;
    }
    latest.set(pnc, {
      pnc,
      timestamp,
      wasNew,
      priceBefore: parseBrlPrice(item.priceBefore),
      priceAfter: parseBrlPrice(item.priceAfter),
    });
  }
  return latest;
}

export function parseMachineListHtml(html: string): MachineList {
  const catalog = extractCatalogJson(html);
  const rows = catalog.produtos;
  if (!Array.isArray(rows)) throw new Error('Lista "produtos" não encontrada no arquivo.');

  const listDate = new Date(String(catalog.date ?? ''));
  if (Number.isNaN(listDate.getTime())) throw new Error('O arquivo não traz a data da lista.');

  const updates = readUpdates(catalog);
  const seen = new Set<string>();
  const displayOrders = new Map<string, number>();
  const machines: ListedMachine[] = [];
  const rejected: RejectedMachine[] = [];

  for (const row of rows as Record<string, unknown>[]) {
    const pnc = cleanText(row?.pnc);
    const normalizedPnc = normalizeIdentifier(pnc);
    if (!pnc || !normalizedPnc) {
      rejected.push({ pnc: pnc ?? '', reason: 'SEM_PNC' });
      continue;
    }
    const model = cleanText(row.model);
    if (!model) {
      rejected.push({ pnc, reason: 'SEM_MODELO' });
      continue;
    }
    const listPrice = parseBrlPrice(row.preco);
    if (listPrice === null) {
      rejected.push({ pnc, reason: 'PRECO_INVALIDO' });
      continue;
    }
    if (seen.has(normalizedPnc)) {
      rejected.push({ pnc, reason: 'PNC_REPETIDO' });
      continue;
    }
    seen.add(normalizedPnc);

    const update = updates.get(normalizedPnc);
    // O registro de mudança só vale se descreve o preço de hoje: um "antes/depois" de lista
    // intermediária não pode aparecer como se fosse a última mudança.
    const priceChanged =
      update !== undefined &&
      update.priceBefore !== null &&
      update.priceAfter === listPrice &&
      update.priceBefore !== listPrice;

    machines.push({
      pnc,
      normalizedPnc,
      model,
      description: cleanText(row.descricao) ?? model,
      category: cleanText(row.categoria) ?? 'SEM CATEGORIA',
      segment: cleanText(row.segmento),
      technology: cleanText(row.tecnologia),
      application: parseApplication(row.aplicacao),
      listPrice,
      discontinued: /descontinu/i.test(cleanText(row.motivo_sem_preco) ?? ''),
      isNew: update?.wasNew === true,
      priceBefore: priceChanged ? update.priceBefore : null,
      sortOrder: 0,
      specs: buildSpecs(row),
      details: htmlToPlainLines(row.descricao_detalhada),
      photo: readPhoto(catalog.images, row.img),
    });
    displayOrders.set(normalizedPnc, Number(cleanText(row.ordem_exibicao)) || 9999);
  }

  assignSortOrder(machines, catalog, displayOrders);
  return { listDate, machines, rejected };
}

function positionIn(list: unknown, value: string | null): number {
  const index = Array.isArray(list) && value !== null ? list.indexOf(value) : -1;
  return index === -1 ? 999 : index;
}

/**
 * Ordem da Husqvarna: tecnologia, depois categoria (cada tecnologia tem a sua lista) e depois a "ordem de
 * exibição" da máquina. É a ordem em que a própria página deles mostra (motosserra e roçadeira antes de
 * aparador e atomizador), que é também o que a loja mais vende. O que o arquivo não ordena fica no fim,
 * na ordem em que veio.
 */
function assignSortOrder(machines: ListedMachine[], catalog: Record<string, unknown>, displayOrders: Map<string, number>): void {
  const technologyOrder = (catalog.technologyOrder as Record<string, unknown> | undefined)?.produtos;
  const categoryOrder = (catalog.categoryOrder ?? {}) as Record<string, unknown>;
  const keyed = machines.map((machine, index) => ({
    machine,
    index,
    technology: positionIn(technologyOrder, machine.technology),
    category: positionIn(categoryOrder[`produtos\u001f${machine.technology ?? ''}`], machine.category),
    display: displayOrders.get(machine.normalizedPnc) ?? 9999,
  }));
  keyed.sort((a, b) => a.technology - b.technology || a.category - b.category || a.display - b.display || a.index - b.index);
  keyed.forEach((item, position) => {
    item.machine.sortOrder = position;
  });
  machines.sort((a, b) => a.sortOrder - b.sortOrder);
}
