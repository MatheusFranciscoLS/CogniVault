// Relatório de diferenças entre a lista de preços nova e o que está no banco.
// Função pura: não toca em banco nem em arquivo. Roda antes de qualquer gravação.
import { commercialPrice } from './price-list-rules';
import type { HtmlPriceItem } from './price-list-html';

export type StoredPart = {
  normalizedNumber: string;
  partNumber: string;
  name: string;
  price: number | null;
  ncm: string | null;
  ean: string | null;
  category?: string | null;
};

export type PriceChange = {
  normalizedNumber: string;
  partNumber: string;
  name: string;
  before: number | null;
  after: number;
  /** variação em %, null quando não havia preço antes */
  percent: number | null;
};

export type PriceListDiff = {
  stored: number;
  incoming: number;
  unchanged: number;
  changed: PriceChange[];
  /** código novo na lista, que o banco ainda não tem */
  added: HtmlPriceItem[];
  /** código do banco que a lista nova não traz: o preço dele NÃO é atualizado */
  missingFromList: StoredPart[];
  namesDiffer: number;
};

function sameMoney(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 0.005;
}

export function diffPriceList(stored: StoredPart[], incoming: HtmlPriceItem[]): PriceListDiff {
  const storedByCode = new Map(stored.map(part => [part.normalizedNumber, part]));
  const incomingCodes = new Set(incoming.map(item => item.normalizedNumber));

  const changed: PriceChange[] = [];
  const added: HtmlPriceItem[] = [];
  let unchanged = 0;
  let namesDiffer = 0;

  for (const item of incoming) {
    const current = storedByCode.get(item.normalizedNumber);
    if (!current) {
      added.push(item);
      continue;
    }

    const after = commercialPrice(item.consumerPrice) as number;
    if (current.name !== item.name) namesDiffer += 1;

    if (sameMoney(current.price, after)) {
      unchanged += 1;
      continue;
    }

    changed.push({
      normalizedNumber: item.normalizedNumber,
      partNumber: current.partNumber,
      name: item.name,
      before: current.price,
      after,
      percent: current.price && current.price > 0 ? ((after - current.price) / current.price) * 100 : null,
    });
  }

  return {
    stored: stored.length,
    incoming: incoming.length,
    unchanged,
    changed,
    added,
    missingFromList: stored.filter(part => !incomingCodes.has(part.normalizedNumber)),
    namesDiffer,
  };
}

export function percentBuckets(changes: PriceChange[]): Array<{ label: string; count: number }> {
  const edges: Array<[string, (p: number) => boolean]> = [
    ['caiu mais de 20%', p => p < -20],
    ['caiu de 5% a 20%', p => p >= -20 && p < -5],
    ['caiu até 5%', p => p >= -5 && p < 0],
    ['subiu até 5%', p => p >= 0 && p <= 5],
    ['subiu de 5% a 20%', p => p > 5 && p <= 20],
    ['subiu de 20% a 100%', p => p > 20 && p <= 100],
    ['subiu mais de 100%', p => p > 100],
  ];
  const buckets = edges.map(([label]) => ({ label, count: 0 }));
  for (const change of changes) {
    if (change.percent === null) continue;
    const index = edges.findIndex(([, test]) => test(change.percent as number));
    if (index >= 0) buckets[index].count += 1;
  }
  return buckets;
}
