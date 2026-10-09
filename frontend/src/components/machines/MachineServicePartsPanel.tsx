import { useMemo } from 'react';
import { cleanErpCode, formatHusqvarnaPartNumber } from '../../lib';
import { Button } from '@/components/ui/button';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { normalizeCode, useMasterPrices } from './master-part-prices';
import PartPriceTag from './PartPriceTag';
import { useMachineServiceParts, type ServicePart } from './use-machine-service-parts';

const KIND_LABEL: Record<ServicePart['kind'], string> = { PREVENTIVO: 'Preventiva', CONSUMIVEL: 'Consumível', PREDITIVO: 'Preditiva' };

/**
 * Peças de REVISÃO da máquina (campo "reparo" da lista de preços da Husqvarna): o que se troca antes de quebrar. Aparece para a máquina que o kit de
 * manutenção do catálogo interno não cobre, e some quando a lista ainda não foi carregada com o campo. Cada linha mostra o preço e a prateleira da
 * loja; "Adicionar revisão ao orçamento" põe todas de uma vez (o atendente tira o que o cliente não quer no próprio orçamento).
 */
export default function MachineServicePartsPanel({ pnc, model }: { pnc: string; model: string }) {
  const quoteCart = useQuoteCart();
  const query = useMachineServiceParts(pnc);
  const parts = useMemo(() => query.data ?? [], [query.data]);
  const prices = useMasterPrices(parts.map(part => part.partNumber));

  const cartItems = useMemo(() => parts.map(part => {
    const hit = prices.data?.prices[normalizeCode(part.partNumber)];
    return {
      partNumber: part.partNumber,
      effectiveCode: part.partNumber,
      manufacturer: 'Husqvarna',
      name: hit?.name || part.name,
      model,
      pnc,
      unitPrice: hit?.price ?? undefined,
      quantity: 1,
    };
  }), [model, parts, pnc, prices.data]);

  if (query.isLoading || !parts.length) return null;
  const allInCart = cartItems.every(item => quoteCart.items.some(inCart => normalizeCode(inCart.partNumber) === normalizeCode(item.partNumber)));

  return (
    <section aria-label="Peças de revisão" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="text-lg font-semibold">Peças de revisão · {model}</h3>
        <Button variant={allInCart ? 'added' : 'add'} disabled={allInCart} onClick={() => quoteCart.addItems(cartItems)}>
          {allInCart ? 'Revisão no orçamento' : 'Adicionar revisão ao orçamento'}
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {parts.map((part, index) => {
          const inCart = quoteCart.items.some(item => normalizeCode(item.partNumber) === normalizeCode(part.partNumber));
          return (
            <li key={part.partNumber} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-muted-foreground">{KIND_LABEL[part.kind]}</div>
                <div className="truncate text-base font-semibold" title={part.name}>{part.name}</div>
              </div>
              <PartPriceTag code={part.partNumber} prices={prices.data?.prices} />
              <span translate="no" className="font-code text-xl font-semibold tabular-nums">{formatHusqvarnaPartNumber(cleanErpCode(part.partNumber)) || cleanErpCode(part.partNumber)}</span>
              <Button variant={inCart ? 'added' : 'add'} onClick={() => quoteCart.addItem(cartItems[index])}>
                {inCart ? 'No orçamento' : '+ Orçamento'}<span className="sr-only">, {part.name}</span>
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
