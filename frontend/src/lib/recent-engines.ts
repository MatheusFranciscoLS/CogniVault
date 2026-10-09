import type { EngineBrandName } from './engine-input';

/**
 * Os últimos motores que o atendente digitou da plaqueta, por aparelho.
 *
 * No balcão os mesmos motores se repetem o dia todo (poucos modelos de Kohler e Kawasaki cobrem a maioria dos tratores vendidos), e digitar
 * `SV540-3212` de novo com o cliente esperando é atrito que o atalho tira. Só guarda o que o próprio atendente digitou: nada que o sistema
 * deduziu entra aqui.
 */

export type RecentEngine = { brand: EngineBrandName; model: string };

const STORAGE_KEY = 'cognivault_recent_engines';
const LIMIT = 6;
const BRANDS: EngineBrandName[] = ['Kohler', 'Kawasaki', 'Briggs & Stratton', 'Husqvarna'];

const sameEngine = (a: RecentEngine, b: RecentEngine) => a.brand === b.brand && a.model.toUpperCase() === b.model.toUpperCase();

/** Põe o motor na frente, sem repetir, e corta no limite. Função pura: quem grava é `saveRecentEngines`. */
export function pushRecentEngine(list: RecentEngine[], engine: RecentEngine, limit = LIMIT): RecentEngine[] {
  const model = engine.model.trim();
  if (!model) return list;
  const entry = { brand: engine.brand, model };
  return [entry, ...list.filter(item => !sameEngine(item, entry))].slice(0, limit);
}

export function loadRecentEngines(): RecentEngine[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RecentEngine => (
        typeof item === 'object' && item !== null
        && BRANDS.includes((item as RecentEngine).brand)
        && typeof (item as RecentEngine).model === 'string'
        && (item as RecentEngine).model.trim().length > 0
        && (item as RecentEngine).model.length <= 40
      ))
      .slice(0, LIMIT);
  } catch {
    // Armazenamento bloqueado ou texto quebrado: o balcão só perde os atalhos.
    return [];
  }
}

export function saveRecentEngines(list: RecentEngine[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    // Sem armazenamento, o atalho some no próximo carregamento e mais nada.
  }
}
