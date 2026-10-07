// Lógica da aba "Tabela de preços" (máquinas da lista vigente da Husqvarna): filtro, ordenação e rótulos.
// Pura, para ser testada sem tela. O preço aqui é o PREÇO DA LISTA, sem a divisão por 0,92 das peças.

export type MachineSpec = { label: string; value: string };

export type ListedMachine = {
  pnc: string;
  model: string;
  description: string;
  category: string;
  segment: string | null;
  technology: string | null;
  application: 'PROFISSIONAL' | 'COMERCIAL' | 'OCASIONAL' | null;
  listPrice: number;
  discontinued: boolean;
  isNew: boolean;
  priceBefore: number | null;
  /** Posição na ordem de exibição da Husqvarna (tecnologia, categoria, ordem da máquina). */
  sortOrder: number;
  specs: MachineSpec[];
  /** A lista tem a foto desta máquina (`/api/machine-list/:pnc/photo`). */
  hasPhoto?: boolean;
  details: string | null;
};

export type MachineListResponse = { listDate: string | null; machines: ListedMachine[] };

export type MachineFilters = {
  text: string;
  technology: string;
  category: string;
  application: string;
  onlyNews: boolean;
};

export const EMPTY_FILTERS: MachineFilters = { text: '', technology: '', category: '', application: '', onlyNews: false };

export type MachineSort = 'category' | 'model' | 'price-asc' | 'price-desc';

/** Sem acento, minúsculo, sem pontuação: "Roçadeira 143R-II" casa com "rocadeira 143rii". */
export function searchKey(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const TECHNOLOGY_LABELS: Record<string, string> = {
  'PRODUTOS A COMBUSTÃO': 'Combustão',
  BATERIA: 'Bateria',
  'ROBÓTICA': 'Robótica',
  MANUAL: 'Manual',
};

export function technologyLabel(technology: string | null): string {
  if (!technology) return 'Outros';
  return TECHNOLOGY_LABELS[technology] ?? capitalize(technology);
}

const APPLICATION_LABELS: Record<string, string> = { PROFISSIONAL: 'Profissional', COMERCIAL: 'Comercial', OCASIONAL: 'Ocasional' };

export function applicationLabel(application: string | null): string {
  return application ? (APPLICATION_LABELS[application] ?? capitalize(application)) : '';
}

/** "ROÇADEIRA COSTAL" -> "Roçadeira costal". A lista escreve tudo em caixa-alta. */
export function capitalize(input: string): string {
  const text = input.trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function categoryLabel(category: string): string {
  return capitalize(category);
}

export function matchesFilters(machine: ListedMachine, filters: MachineFilters): boolean {
  if (filters.technology && (machine.technology ?? '') !== filters.technology) return false;
  if (filters.category && machine.category !== filters.category) return false;
  if (filters.application && machine.application !== filters.application) return false;
  if (filters.onlyNews && !(machine.isNew || machine.priceBefore !== null)) return false;
  // Cada palavra digitada precisa aparecer, em qualquer ordem: "rocadeira 143r-ii" acha "ROCADEIRA MOD. 143R II".
  const words = filters.text.split(/\s+/).map(searchKey).filter(Boolean);
  if (words.length) {
    const haystack = searchKey(`${machine.model} ${machine.description} ${machine.pnc} ${machine.category}`);
    if (!words.every(word => haystack.includes(word))) return false;
  }
  return true;
}

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

export function sortMachines(machines: ListedMachine[], sort: MachineSort): ListedMachine[] {
  const copy = [...machines];
  switch (sort) {
    case 'model':
      return copy.sort((a, b) => collator.compare(a.model, b.model));
    case 'price-asc':
      return copy.sort((a, b) => a.listPrice - b.listPrice || collator.compare(a.model, b.model));
    case 'price-desc':
      return copy.sort((a, b) => b.listPrice - a.listPrice || collator.compare(a.model, b.model));
    default:
      // A ordem é a da Husqvarna (motosserra e roçadeira primeiro), não a alfabética.
      return copy.sort((a, b) => a.sortOrder - b.sortOrder || collator.compare(a.model, b.model));
  }
}

/** Opções do filtro com a contagem de cada uma, respeitando os OUTROS filtros (não o próprio). */
export function facetCounts(
  machines: ListedMachine[],
  filters: MachineFilters,
  field: 'technology' | 'category' | 'application',
): Array<{ value: string; count: number }> {
  const others = { ...filters, [field]: '' } as MachineFilters;
  const counts = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  for (const machine of machines) {
    if (!matchesFilters(machine, others)) continue;
    const value = machine[field];
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
    firstSeen.set(value, Math.min(firstSeen.get(value) ?? Infinity, machine.sortOrder));
  }
  // Tecnologia e categoria na ordem da Husqvarna; aplicação (e empate) em ordem alfabética.
  const byHusqvarna = field !== 'application';
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (byHusqvarna ? (firstSeen.get(a.value) ?? 0) - (firstSeen.get(b.value) ?? 0) : 0) || collator.compare(a.value, b.value));
}

export type PriceChange = { direction: 'down' | 'up'; before: number } | null;

export function priceChange(machine: Pick<ListedMachine, 'priceBefore' | 'listPrice'>): PriceChange {
  if (machine.priceBefore === null || machine.priceBefore === machine.listPrice) return null;
  return { direction: machine.listPrice < machine.priceBefore ? 'down' : 'up', before: machine.priceBefore };
}

export function countNews(machines: ListedMachine[]): number {
  return machines.filter(machine => machine.isNew || machine.priceBefore !== null).length;
}

/**
 * A lista escreve 36 das 151 máquinas com `BR` depois do artigo (`970743401BR`: a versão do Brasil), mas o Portal e a
 * busca conhecem só os 9 dígitos. Sem tirar o `BR`, o Portal respondia 400 e a máquina ficava sem "o que acompanha",
 * sem "leve junto", sem vista explodida e sem o selo "Em linha". Os outros sufixos (`CJ`, `CJ1`, `S12`: conjunto) são
 * outro item e continuam como vieram.
 */
/** Foto da própria lista (banco privado), só para quem está logado. */
export const machinePhotoUrl = (pnc: string): string => `/api/machine-list/${encodeURIComponent(pnc)}/photo`;

export const portalPnc = (pnc: string): string => pnc.trim().replace(/(?<=\d)BR$/i, '');

const pncKey = (pnc: string): string => portalPnc(pnc.replace(/[^a-z0-9]/gi, '')).toUpperCase();

/**
 * Acha na lista a máquina de um PNC. A etiqueta pode trazer 11 dígitos e o Portal usa os 9 primeiros (o artigo
 * tem sempre 9 dígitos), então vale igualdade exata OU o mesmo prefixo de 9 dígitos numéricos. Qualquer outro
 * parecido NÃO casa: sufixo de letras (`970592606CJ`) é outro item.
 */
export function findListedMachine(machines: ListedMachine[], pnc: string): ListedMachine | null {
  const wanted = pncKey(pnc);
  if (!wanted) return null;
  const exact = machines.find(machine => pncKey(machine.pnc) === wanted);
  if (exact) return exact;
  const article = /^\d{9}/.exec(wanted)?.[0];
  if (!article || !/^\d+$/.test(wanted)) return null;
  return machines.find(machine => {
    const key = pncKey(machine.pnc);
    return /^\d+$/.test(key) && key.startsWith(article) && (key.length === 9 || wanted.length === 9 || key === wanted);
  }) ?? null;
}
