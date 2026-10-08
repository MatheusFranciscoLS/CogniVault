// Orçamentos agrupados por dia da LOJA (São Paulo), nunca do navegador nem do servidor: depois das 21h o UTC já virou o dia.
const STORE_TZ = 'America/Sao_Paulo';

/** "2026-10-07" no fuso da loja. */
export function storeDayKey(value: string | Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** "Hoje", "Ontem" ou "quarta-feira, 07/10/2026". */
export function dayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return 'Hoje';
  if (key === shiftKey(todayKey, -1)) return 'Ontem';
  const [y, m, d] = key.split('-').map(Number);
  const text = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

export function groupByStoreDay<T>(items: T[], when: (item: T) => string): Array<{ key: string; items: T[] }> {
  const groups: Array<{ key: string; items: T[] }> = [];
  for (const item of items) {
    const key = storeDayKey(when(item));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return groups;
}

/** Hora de parede da loja: "23:32". */
export function storeTime(value: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: STORE_TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
