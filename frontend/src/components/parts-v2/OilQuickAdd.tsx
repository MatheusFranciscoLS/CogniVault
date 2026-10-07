import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { OIL_OPTIONS, looksLikeOilQuery } from '../../lib/oil-query';

/**
 * Pergunta de óleo no Atendimento: os quatro óleos da loja como botões, no topo da lista.
 *
 * Antes a pergunta "óleo 2 tempos" devolvia 20 linhas de filtro e vela, e o óleo (que é o que o cliente quer) não
 * aparecia, porque a loja não cadastra código de óleo. Cada botão põe o óleo no orçamento como item avulso; o
 * atendente confere o preço no próprio orçamento.
 */
export default function OilQuickAdd({ query, machineModel }: { query: string; machineModel?: string }) {
  const quoteCart = useQuoteCart();
  if (!looksLikeOilQuery(query)) return null;

  return (
    <section aria-label="Óleo" className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
      <h2 className="mr-1 text-lg font-semibold">Óleo</h2>
      {OIL_OPTIONS.map(option => {
        const inCart = quoteCart.items.some(item => item.partNumber === option.code);
        return (
          <Button
            key={option.code}
            variant={inCart ? 'added' : 'add'}
            onClick={() => {
              quoteCart.addItem({ partNumber: option.code, name: option.label, model: machineModel ?? '' });
              toast.success(`${option.label} no orçamento.`);
            }}
          >
            {inCart ? `${option.label} · no orçamento` : `+ ${option.label}`}
          </Button>
        );
      })}
    </section>
  );
}
