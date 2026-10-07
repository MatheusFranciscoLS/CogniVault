import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { apiJson, cleanErpCode } from '../../lib';
import { bareHusqvarnaCode } from '../../lib/bare-code';
import { normalizeCode, useMasterPrices } from '../machines/master-part-prices';
import PartPriceTag from '../machines/PartPriceTag';
import CodeReplacementBanner, { type ReplacementStep } from './CodeReplacementBanner';
import type { HusqvarnaLivePart } from './types';

/**
 * Checagem AUTOMÁTICA de troca de código: o atendente digitou só um código, e o Portal Husqvarna diz se ele foi
 * substituído. Antes isso só aparecia depois de abrir a gaveta da peça (ou quando nada era achado), e quem pedia
 * o código antigo na Husqvarna levava recusa: ela só aceita o novo (dono, 2026-10-07).
 *
 * A faixa já traz o que o balcão faz a seguir com o código NOVO: o preço e a prateleira da loja (se ela tem a peça)
 * e o "+ Orçamento" com o código novo. Não existe "buscar de novo": é a mesma peça (dono, 2026-10-07).
 *
 * O servidor guarda a resposta do Portal em cache (1 h), então repetir o mesmo código não custa outra consulta.
 * Se o Portal não responde ou não conhece o código, não aparece nada: a busca segue como sempre foi.
 */
export default function CodeReplacementCheck({
  query,
  machineModel,
  onCopy,
}: {
  query: string;
  machineModel?: string;
  onCopy: (code: string) => void;
}) {
  const quoteCart = useQuoteCart();
  const code = bareHusqvarnaCode(query);
  const [copied, setCopied] = useState(false);
  const check = useQuery({
    queryKey: ['code-replacement', code],
    enabled: Boolean(code),
    staleTime: 30 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const response = await apiJson<{ livePart: HusqvarnaLivePart }>(`/api/parts/${encodeURIComponent(code as string)}/live-data`, { timeoutMs: 15_000 });
      return response.livePart;
    },
  });

  const latest = check.data?.replacedBy ? cleanErpCode(check.data.replacedBy) : null;
  const prices = useMasterPrices(latest ? [latest] : []);
  if (!code || !latest) return null;

  const asked = cleanErpCode(code);
  const chain: ReplacementStep[] = check.data?.replacementChain ?? [];
  const hit = prices.data?.prices[normalizeCode(latest)];
  const inCart = quoteCart.items.some(item => normalizeCode(item.partNumber) === normalizeCode(latest));

  return (
    <CodeReplacementBanner
      asked={asked}
      latest={latest}
      chain={chain}
      copied={copied}
      onCopy={() => {
        onCopy(latest);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      <PartPriceTag code={latest} prices={prices.data?.prices} />
      <Button
        variant={inCart ? 'added' : 'add'}
        onClick={() => {
          // O orçamento leva o código NOVO e guarda o antigo como "era", como em toda substituição.
          quoteCart.addItem({
            partNumber: latest,
            effectiveCode: latest,
            manufacturer: 'Husqvarna',
            name: hit?.name || check.data?.name || 'Peça Husqvarna',
            model: machineModel ?? '',
            isSuperseded: true,
            originalCode: asked,
            unitPrice: hit?.price ?? undefined,
          });
          toast.success(`${latest} no orçamento.`);
        }}
      >
        {inCart ? 'No orçamento' : '+ Orçamento'}
      </Button>
    </CodeReplacementBanner>
  );
}
