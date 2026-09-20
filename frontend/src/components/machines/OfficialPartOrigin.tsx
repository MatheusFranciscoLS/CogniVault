import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiJson } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import PartPriceTag from './PartPriceTag';
import { useMasterPrices } from './master-part-prices';

type OfficialPartHit = {
  source: 'BRIGGS' | 'KAWASAKI';
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
  const precos = useMasterPrices(hits.map(hit => hit.partNumber)).data;
  if (!hits.length) return null;

  const [primeiro] = hits;

  return (
    <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white dark:border-emerald-900/50 dark:bg-ink-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-emerald-100 bg-emerald-50/60 px-4 py-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <span className="text-[10px] font-black uppercase tracking-[.12em] text-emerald-800 dark:text-emerald-300">
          Catálogo oficial · {primeiro.partNumber}
        </span>
        <span className="text-[11px] font-bold text-ink-700 dark:text-ink-200">{primeiro.name}</span>
      </div>

      <div className="divide-y divide-ink-100 dark:divide-ink-800">
        {hits.map(hit => (
          <div
            key={`${hit.source}-${hit.engineModel}-${hit.position}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5"
          >
            <span className="shrink-0 rounded bg-ink-100 px-1.5 text-[10px] font-black uppercase text-ink-600 dark:bg-ink-800 dark:text-ink-300">
              {MARCA[hit.source]}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs font-bold text-ink-800 dark:text-ink-100">
              {hit.engineModel}
              {hit.assembly ? (
                <span className="font-sans font-normal text-ink-500 dark:text-ink-400"> · {hit.assembly}</span>
              ) : null}
            </span>
            {hit.position ? (
              <span className="shrink-0 font-mono text-[10px] font-bold text-ink-500 dark:text-ink-400">
                pos. {hit.position}
              </span>
            ) : null}
            {hit.quantity && hit.quantity > 1 ? (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                leva {hit.quantity}
              </span>
            ) : null}
            <PartPriceTag code={hit.partNumber} prices={precos} />
            <div className="flex shrink-0 gap-1.5">
              {onSearchPart && (
                <button
                  type="button"
                  onClick={() => onSearchPart(hit.engineModel)}
                  className="cv-touch-target rounded border border-ink-200 px-2 text-[10px] font-bold text-ink-600 transition hover:border-brand-300 hover:text-brand-700 dark:border-ink-700 dark:text-ink-300"
                >
                  abrir motor
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  quoteCart.addItem({
                    partNumber: hit.partNumber,
                    name: hit.name,
                    model: hit.engineModel,
                    section: hit.assembly || undefined,
                    position: hit.position || undefined,
                    quantity: hit.quantity || 1,
                  });
                  toast.success(`${hit.partNumber} no orçamento.`);
                }}
                className="cv-touch-target rounded bg-accent-700 px-2 text-[10px] font-bold text-white transition hover:bg-accent-800"
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
