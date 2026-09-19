import { formatPrice, normalizeCode, type MasterPriceMap } from './master-part-prices';

/**
 * O que a LOJA sabe sobre a peça do catálogo do fabricante: preço, prateleira
 * e estoque.
 *
 * Kawasaki e Briggs publicam código e descrição; preço nenhuma das duas dá. E a
 * loja não compra todas as peças do catálogo — a maioria das linhas de um
 * catálogo de motor não é item de estoque daqui.
 *
 * Quatro estados, e o último é silêncio de propósito:
 *
 * - **Preço do mês corrente**: mostra e pronto.
 * - **Preço de mês anterior**: mostra **com aviso**. Regra do dono: *"poderia
 *   mostrar o preço mas ter uma atenção falando que deveria consultar
 *   novamente (pode ser que esteja mais caro a peça)"*. O valor guardado é o da
 *   última compra, não uma tabela viva: vender pelo antigo é prejuízo que
 *   ninguém percebe até fechar o mês. Nunca esconder — mesmo velho ele é
 *   referência, e esconder deixaria o atendente sem nada.
 * - **Cadastrada sem preço**: "sem preço". É falha de cadastro, que o dono
 *   corrige, e não é o mesmo que não vender a peça.
 * - **Fora do cadastro**: **nada**. Num catálogo de 283 linhas, escrever "não
 *   cadastrada" em cada uma encheria a tela de ruído para dizer o óbvio. O
 *   contador no topo já dá o número.
 */
export default function PartPriceTag({ code, prices }: { code: string; prices: MasterPriceMap | undefined }) {
  if (!prices) return null;

  const hit = prices[normalizeCode(code)];
  if (!hit) return null;

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {/* A prateleira vem antes do preço: com o cliente na frente, o atendente
          precisa saber ONDE a peça está tanto quanto quanto ela custa. */}
      {hit.location ? (
        <span
          title="Prateleira"
          className="rounded bg-brand-50 px-1.5 font-mono text-[10px] font-bold text-brand-800 dark:bg-brand-950/50 dark:text-brand-300"
        >
          {hit.location}
        </span>
      ) : null}

      {hit.stock != null && hit.stock <= 0 ? (
        <span className="rounded bg-ink-100 px-1.5 text-[10px] font-bold text-ink-600 dark:bg-ink-800 dark:text-ink-300">
          sem estoque
        </span>
      ) : null}

      {hit.price == null ? (
        <span className="text-[10px] font-bold text-ink-400 dark:text-ink-500">sem preço</span>
      ) : (
        <span
          className={`font-mono text-xs font-black tabular-nums ${
            hit.freshness === 'FRESH'
              ? 'text-emerald-800 dark:text-emerald-300'
              : 'text-amber-800 dark:text-amber-300'
          }`}
          title={
            hit.freshness === 'FRESH'
              ? undefined
              : hit.freshness === 'STALE'
                ? 'Preço da última compra, de mês anterior. Confirme antes de fechar.'
                : 'Sem data da última compra. Confirme antes de fechar.'
          }
        >
          {formatPrice(hit.price)}
          {hit.freshness === 'FRESH' ? null : <span aria-hidden="true"> ⚠</span>}
          {hit.freshness === 'FRESH' ? null : <span className="sr-only"> — confirme o preço</span>}
        </span>
      )}
    </span>
  );
}
