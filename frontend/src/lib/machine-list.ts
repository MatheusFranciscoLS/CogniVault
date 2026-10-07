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
  specs: MachineSpec[];
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
      return copy.sort((a, b) => collator.compare(a.category, b.category) || collator.compare(a.model, b.model));
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
  for (const machine of machines) {
    if (!matchesFilters(machine, others)) continue;
    const value = machine[field];
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => collator.compare(a.value, b.value));
}

export type PriceChange = { direction: 'down' | 'up'; before: number } | null;

export function priceChange(machine: Pick<ListedMachine, 'priceBefore' | 'listPrice'>): PriceChange {
  if (machine.priceBefore === null || machine.priceBefore === machine.listPrice) return null;
  return { direction: machine.listPrice < machine.priceBefore ? 'down' : 'up', before: machine.priceBefore };
}

export function countNews(machines: ListedMachine[]): number {
  return machines.filter(machine => machine.isNew || machine.priceBefore !== null).length;
}
