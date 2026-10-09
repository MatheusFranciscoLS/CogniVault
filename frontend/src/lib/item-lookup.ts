import type { MasterPrice } from '../components/machines/master-part-prices';

/**
 * Item digitado no orçamento com CÓDIGO: o que o sistema preenche sozinho e o que fica em aberto (pedido do dono, 2026-10-09).
 *
 * A Vardão é assistência multimarcas, com 10 fornecedores ou mais (Branco, Tramontina, Vipeças...). Ninguém consegue cadastrar todos os códigos,
 * então a regra é esta: **Husqvarna, Briggs, Kawasaki e Kohler** são automáticos (descrição e, quando a loja tem a peça, o preço); **qualquer outro
 * código não puxa nada** e o balcão escreve a descrição e o preço. Esta função só decide a partir do que as duas fontes já devolveram:
 *  - o cadastro de preços da loja (`MasterPart`: descrição, preço, prateleira, se o preço é velho);
 *  - o índice dos catálogos oficiais de motor (`OfficialPartIndex`: Briggs, Kawasaki, Kohler), que só tem descrição, nunca preço.
 */

export type OfficialHit = { source: 'BRIGGS' | 'KAWASAKI' | 'KOHLER'; name: string };

export type ItemLookup =
  | { kind: 'NONE' }
  | {
    kind: 'FOUND';
    /** De onde veio: o cadastro da loja ou o catálogo oficial do motor. */
    origin: 'LOJA' | 'OFICIAL';
    name: string;
    /** Preço de venda da loja; `undefined` quando a loja não tem a peça com preço (catálogo de motor não traz preço). */
    price?: number;
    /** Marca que sai no orçamento (Husqvarna, Briggs & Stratton, Kawasaki, Kohler); `undefined` quando não dá para afirmar. */
    manufacturer?: string;
    /** Preço de mês anterior ou sem data: mostra, mas manda conferir (regra do dono). */
    confirmPrice: boolean;
    /** Prateleira da peça no cadastro da loja (o Clipp vai alimentar); só do balcão. */
    location?: string;
  };

const MARCA: Record<OfficialHit['source'], string> = { BRIGGS: 'Briggs & Stratton', KAWASAKI: 'Kawasaki', KOHLER: 'Kohler' };

/** Código Husqvarna de peça tem 9 dígitos; o cadastro da loja é quase todo dela. Qualquer outro formato no cadastro fica sem marca. */
const HUSQVARNA_CODE = /^\d{9}$/;

export function resolveItemLookup(input: { code: string; store?: MasterPrice | null; official?: OfficialHit[] }): ItemLookup {
  const code = input.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (code.length < 4) return { kind: 'NONE' };
  const store = input.store ?? null;
  const official = (input.official ?? []).find(hit => hit.name.trim());
  const price = store && typeof store.price === 'number' && store.price > 0 ? store.price : undefined;

  // A loja manda: o nome e o preço dela são os que valem no orçamento.
  if (store && store.name.trim()) {
    const manufacturer = official ? MARCA[official.source] : HUSQVARNA_CODE.test(code) ? 'Husqvarna' : undefined;
    const location = store.location?.trim() || undefined;
    return { kind: 'FOUND', origin: 'LOJA', name: store.name.trim(), price, manufacturer, confirmPrice: price !== undefined && store.freshness !== 'FRESH', location };
  }
  // Só o catálogo do motor conhece o código: descrição automática, preço em aberto.
  if (official) return { kind: 'FOUND', origin: 'OFICIAL', name: official.name.trim(), manufacturer: MARCA[official.source], confirmPrice: false };
  return { kind: 'NONE' };
}
