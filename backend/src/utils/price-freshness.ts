import { STORE_TIME_ZONE, todayInStore } from './store-day';

/**
 * O preço da loja envelhece, e o balcão precisa saber disso.
 *
 * Regra do dono, nas palavras dele: *"se a compra for desse mês, mostrar. Agora
 * se a compra for do mês passado, poderia mostrar o preço mas ter uma atenção
 * falando que deveria consultar novamente (pode ser que esteja mais caro a
 * peça)"*.
 *
 * O preço guardado é o da **última compra**, não uma tabela viva. Peça comprada
 * há meses pode ter subido no fornecedor, e vender pelo valor antigo é prejuízo
 * silencioso — o tipo de erro que ninguém percebe até fechar o mês.
 *
 * **Nunca esconde o preço.** Mesmo velho ele serve de referência, e esconder
 * deixaria o atendente sem nada. O que muda é o aviso ao lado.
 */
export type PriceFreshness =
  /** Compra no mês corrente da loja. Preço vale como está. */
  | 'FRESH'
  /** Compra em mês anterior. Mostra, mas manda conferir. */
  | 'STALE'
  /** Sem data de compra. Não dá para afirmar que está atual — trata como STALE. */
  | 'UNKNOWN';

/**
 * Mês da loja no formato `AAAA-MM`.
 *
 * Calculado no fuso da **loja**, nunca no do processo. O Render roda em UTC e a
 * loja não: no dia 1º às 00h30 de Brasília já é dia 1º às 03h30 em UTC, mas no
 * dia 31 às 21h de Brasília o UTC já virou o mês. Ler o mês do relógio do
 * servidor marcaria como "mês passado" uma compra feita hoje de manhã. É a
 * mesma classe de bug que `store-day.ts` existe para evitar.
 */
export function storeMonth(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value ?? '';
  const month = parts.find(part => part.type === 'month')?.value ?? '';
  return `${year}-${month}`;
}

/** O mês corrente da loja, `AAAA-MM`. */
export function currentStoreMonth(): string {
  return todayInStore().slice(0, 7);
}

/**
 * Classifica o preço pela data da última compra.
 *
 * `reference` existe para o teste fixar "hoje"; em produção é o mês corrente.
 */
export function priceFreshness(
  lastPurchaseAt: Date | string | null | undefined,
  reference: string = currentStoreMonth(),
): PriceFreshness {
  if (!lastPurchaseAt) return 'UNKNOWN';

  const date = lastPurchaseAt instanceof Date ? lastPurchaseAt : new Date(lastPurchaseAt);
  // Data ilegível é o mesmo caso de data ausente: não dá para afirmar nada.
  // Cair em FRESH aqui seria afirmar que o preço está atual por causa de um
  // campo quebrado, que é exatamente o erro caro.
  if (Number.isNaN(date.getTime())) return 'UNKNOWN';

  const month = storeMonth(date);
  if (month === reference) return 'FRESH';

  // Data no futuro não existe em compra; se aparecer, é erro de cadastro e
  // não vira promessa de preço atual.
  return month > reference ? 'UNKNOWN' : 'STALE';
}
