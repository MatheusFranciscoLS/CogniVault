import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiJson } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { Icon } from '../icons/Icon';

type KawasakiAssembly = { name: string; slug: string; viewerUrl: string };
type KawasakiPart = { position: string | null; partNumber: string; name: string };
type KawasakiCatalog = {
  model: string;
  fullName: string | null;
  assemblies: KawasakiAssembly[];
  lookupUrl: string;
  needsSpec: string[];
};

/**
 * Catálogo de peças do motor Kawasaki, dentro do atendimento.
 *
 * O desenho segue a regra que o dono deu para os três fabricantes: *"se você
 * não deu um retorno com o código, pelo menos dê um retorno com a vista
 * explodida para que o atendente verifique manualmente"*. Por isso cada
 * conjunto mostra as duas coisas — a lista de códigos **e** o link da vista —
 * e nunca uma sem a outra.
 *
 * Três estados, e nenhum deles é um beco sem saída:
 *
 * - **Resolvido**: os conjuntos do motor. Clicar num traz os códigos.
 * - **Falta o spec**: a série tem vários specs e cada um é um catálogo
 *   diferente. Mostra as opções em vez de escolher uma — é a mesma disciplina
 *   do PNC do chat, e o spec está na plaqueta ao lado da série.
 * - **Sem catálogo**: o link da busca oficial, para conferir à mão.
 */
export default function KawasakiEnginePanel({
  model,
  onSearchPart,
}: {
  model: string;
  /** Leva um código para a busca interna, onde há preço e estoque. */
  onSearchPart: (code: string) => void;
}) {
  const quoteCart = useQuoteCart();
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ['kawasaki-engine', model],
    enabled: Boolean(model),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const data = await apiJson<{ kawasaki: KawasakiCatalog }>(
        `/api/kawasaki/engine?model=${encodeURIComponent(model)}`,
        { timeoutMs: 25_000 },
      );
      return data.kawasaki;
    },
  });

  const partsQuery = useQuery({
    queryKey: ['kawasaki-assembly', openSlug],
    enabled: Boolean(openSlug),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const data = await apiJson<{ parts: KawasakiPart[] }>(
        `/api/kawasaki/assembly?slug=${encodeURIComponent(openSlug as string)}`,
        { timeoutMs: 25_000 },
      );
      return data.parts;
    },
  });

  const catalog = catalogQuery.data ?? null;
  const openAssembly = catalog?.assemblies.find(item => item.slug === openSlug) ?? null;

  const copy = (code: string) => {
    void navigator.clipboard.writeText(code).then(
      () => toast.success(`Código ${code} copiado.`),
      () => toast.error(`Não foi possível copiar. Anote: ${code}`),
    );
  };

  if (catalogQuery.isLoading) {
    return (
      <section aria-busy="true" className="rounded-xl border border-ink-200 bg-white px-4 py-5 text-sm font-semibold text-ink-500 dark:border-ink-800 dark:bg-ink-900">
        Abrindo o catálogo Kawasaki de {model}…
      </section>
    );
  }

  if (!catalog) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-2.5 dark:border-ink-800">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="machine" className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
          <span className="truncate text-xs font-black text-ink-700 dark:text-ink-200">
            Motor Kawasaki · {catalog.fullName || catalog.model}
          </span>
        </div>
        <a
          href={catalog.lookupUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 text-[10px] font-bold text-brand-600 hover:underline dark:text-brand-300"
        >
          catálogo oficial ↗
        </a>
      </div>

      {/* Série sem spec: a pergunta certa, não um erro. */}
      {catalog.needsSpec.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-xs font-bold text-ink-800 dark:text-ink-100">
            Este motor tem {catalog.needsSpec.length} versões. Qual é o spec da plaqueta?
          </div>
          <p className="mt-1 text-[11px] leading-5 text-ink-500 dark:text-ink-400">
            O spec vem depois do traço, na mesma plaqueta da série. Cada um tem peças
            próprias, então escolher por você poderia dar o código errado.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {catalog.needsSpec.map(option => {
              const spec = option.trim().split(/\s+/)[0];
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onSearchPart(spec)}
                  className="cv-touch-target rounded-full border border-ink-200 bg-white px-3 font-mono text-[11px] font-bold text-ink-700 transition hover:border-emerald-300 hover:text-emerald-800 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-200"
                >
                  {spec}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {catalog.assemblies.length === 0 && catalog.needsSpec.length === 0 && (
        <div className="px-4 py-3 text-[11px] leading-5 text-ink-500 dark:text-ink-400">
          A Kawasaki não devolveu catálogo para este modelo. Abra o catálogo oficial acima e
          confira a plaqueta do motor — série e spec têm que estar exatos.
        </div>
      )}

      {catalog.assemblies.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-[10px] font-black uppercase tracking-[.12em] text-ink-500 dark:text-ink-400">
            Conjuntos · toque para ver os códigos
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {catalog.assemblies.map(assembly => (
              <button
                key={assembly.slug}
                type="button"
                onClick={() => setOpenSlug(current => (current === assembly.slug ? null : assembly.slug))}
                className={`cv-touch-target rounded-full border px-3 text-[11px] font-bold transition ${
                  openSlug === assembly.slug
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border-ink-200 bg-white text-ink-600 hover:border-emerald-300 hover:text-emerald-800 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-300'
                }`}
              >
                {assembly.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {openAssembly && (
        <div className="border-t border-ink-100 dark:border-ink-800">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-ink-50/70 px-4 py-2 dark:bg-ink-950/40">
            <span className="truncate text-xs font-black text-ink-800 dark:text-ink-100">{openAssembly.name}</span>
            {/* A vista explodida ao lado dos códigos, sempre. É a saída quando a
                descrição em inglês não basta para o atendente decidir. */}
            <a
              href={openAssembly.viewerUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="cv-touch-target inline-flex shrink-0 items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2.5 text-[10px] font-bold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
            >
              ⚙ Ver vista explodida ↗
            </a>
          </div>

          {partsQuery.isLoading && (
            <div aria-busy="true" className="px-4 py-4 text-xs font-semibold text-ink-500 dark:text-ink-400">
              Lendo as peças deste conjunto…
            </div>
          )}

          {!partsQuery.isLoading && !(partsQuery.data ?? []).length && (
            <div className="px-4 py-3 text-[11px] leading-5 text-ink-500 dark:text-ink-400">
              A Kawasaki não devolveu a lista deste conjunto. Use a vista explodida acima
              para ler o código direto do desenho.
            </div>
          )}

          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {(partsQuery.data ?? []).map(part => (
              <div key={`${part.position}-${part.partNumber}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
                <span className="w-14 shrink-0 font-mono text-[10px] font-bold text-ink-500 dark:text-ink-400">
                  {part.position || '—'}
                </span>
                <button
                  type="button"
                  onClick={() => copy(part.partNumber)}
                  title="Copiar o código"
                  className="shrink-0 font-mono text-sm font-black text-ink-900 hover:underline dark:text-brand-300"
                >
                  {/* Cru, como a Kawasaki publica. NÃO passar por
                      `cleanErpCode`: ele remove o hífen, e `15004-0937` sem o
                      hífen não é código de nada. */}
                  {part.partNumber}
                </button>
                <span className="min-w-0 flex-1 truncate text-xs text-ink-700 dark:text-ink-200">{part.name}</span>
                <div className="flex shrink-0 gap-1.5">
                  {/* Preço e estoque são nossos, não da Kawasaki: ela publica
                      "Please Contact a Dealer" em toda linha. Daí o atalho para
                      a busca interna. */}
                  <button
                    type="button"
                    onClick={() => onSearchPart(part.partNumber)}
                    className="cv-touch-target rounded border border-ink-200 px-2 text-[10px] font-bold text-ink-600 transition hover:border-brand-300 hover:text-brand-700 dark:border-ink-700 dark:text-ink-300"
                  >
                    consultar interno
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      quoteCart.addItem({
                        partNumber: part.partNumber,
                        name: part.name || part.partNumber,
                        model: catalog.fullName || catalog.model,
                        section: openAssembly.name,
                        position: part.position || undefined,
                      });
                      toast.success(`${part.partNumber} no orçamento.`);
                    }}
                    className="cv-touch-target rounded bg-accent-700 px-2 text-[10px] font-bold text-white transition hover:bg-accent-800"
                  >
                    + orçamento
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
