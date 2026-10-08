import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiJson } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import PartPriceTag from './PartPriceTag';
import { useMasterPrices } from './master-part-prices';

type OfficialPartHit = {
  source: 'BRIGGS' | 'KAWASAKI' | 'KOHLER';
  engineModel: string;
  assembly: string | null;
  position: string | null;
  partNumber: string;
  name: string;
  quantity: number | null;
};

const MARCA: Record<OfficialPartHit['source'], string> = {
  BRIGGS: 'Briggs',
  KAWASAKI: 'Kawasaki',
  KOHLER: 'Kohler',
};

/**
 * "O cliente chegou com este código — de que motor é?"
 *
 * O caminho inverso do resto do produto, que só sabia ir de máquina para peça.
 * Responde com o que já foi lido do catálogo oficial de Briggs e Kawasaki em
 * atendimentos anteriores: o sistema leu 283 peças ao abrir aquele motor, e
 * até aqui esquecia todas.
 *
 * **Não consulta o fabricante** — é o índice local. Sem custo externo e sem
 * espera, então aparece sozinho quando o texto digitado parece código, sem
 * precisar de botão.
 *
 * A mesma peça em vários motores não é ruído: parafuso e junta servem em
 * muitos, e dizer isso ao balcão evita a devolução por peça trocada.
 */
export default function OfficialPartOrigin({
  code,
  onSearchPart,
}: {
  code: string;
  onSearchPart?: (code: string) => void;
}) {
  const quoteCart = useQuoteCart();

  const { data } = useQuery({
    queryKey: ['official-part-origin', code],
    // Só quando o texto tem cara de código: 4+ caracteres e ao menos 3 dígitos.
    // "carburador" nunca casaria com número de peça, e consultar por descrição
    // seria ida ao servidor para sempre voltar vazio.
    enabled: code.trim().length >= 4 && (code.match(/\d/g) || []).length >= 3,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const result = await apiJson<{ officialParts: OfficialPartHit[] }>(
        `/api/official-parts/by-code?code=${encodeURIComponent(code.trim())}`,
        { timeoutMs: 12_000 },
      );
      return result.officialParts ?? [];
    },
  });

  const hits = data ?? [];
  const priceQuery = useMasterPrices(hits.map(hit => hit.partNumber));
  const precos = priceQuery.data?.prices;
  const precoDegradado = priceQuery.data?.degraded === true;
  if (!hits.length) return null;

  const [primeiro] = hits;

  return (
    <section className="overflow-hidden rounded-xl border border-ok/40 bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ok/40 bg-ok-soft px-4 py-2.5">
        <span className="text-[10px] font-black uppercase tracking-[.12em] text-ok">
          Catálogo oficial · {primeiro.partNumber}
        </span>
        <span className="text-[11px] font-bold text-foreground">{primeiro.name}</span>
      </div>

      <div className="divide-y divide-border">
        {precoDegradado ? (
          <div role="status" className="border-b border-warn/40 bg-warn-soft px-4 py-2 text-[11px] font-semibold text-warn">
            Preços da loja temporariamente indisponíveis. Confirme o valor antes de fechar.
          </div>
        ) : null}
        {hits.map(hit => (
          <div
            key={`${hit.source}-${hit.engineModel}-${hit.position}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5"
          >
            <span className="shrink-0 rounded-sm bg-muted px-1.5 text-[10px] font-black uppercase text-muted-foreground">
              {MARCA[hit.source]}
            </span>
            <span className="min-w-36 flex-1 truncate font-mono text-xs font-bold text-foreground">
              {hit.engineModel}
              {hit.assembly ? (
                <span className="font-sans font-normal text-muted-foreground"> · {hit.assembly}</span>
              ) : null}
            </span>
            {hit.position ? (
              <span className="shrink-0 font-mono text-[10px] font-bold text-muted-foreground">
                pos. {hit.position}
              </span>
            ) : null}
            {hit.quantity && hit.quantity > 1 ? (
              <span className="shrink-0 rounded-sm bg-warn-soft px-1.5 text-[10px] font-bold text-warn">
                leva {hit.quantity}
              </span>
            ) : null}
            <PartPriceTag code={hit.partNumber} prices={precos} />
            <div className="flex shrink-0 gap-1.5">
              {onSearchPart && (
                <button
                  type="button"
                  onClick={() => onSearchPart(hit.engineModel)}
                  className="min-h-10 min-w-10 rounded-sm border border-border px-2 text-[10px] font-bold text-muted-foreground transition hover:border-brand-300 hover:text-brand-700"
                >
                  abrir motor
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  quoteCart.addItem({
                    partNumber: hit.partNumber,
                    manufacturer: MARCA[hit.source],
                    name: hit.name,
                    model: hit.engineModel,
                    section: hit.assembly || undefined,
                    position: hit.position || undefined,
                    quantity: hit.quantity || 1,
                  });
                  toast.success(`${hit.partNumber} no orçamento.`);
                }}
                className="min-h-10 min-w-10 rounded-sm bg-accent-700 px-2 text-[10px] font-bold text-white transition hover:bg-accent-800"
              >
                + orçamento
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
