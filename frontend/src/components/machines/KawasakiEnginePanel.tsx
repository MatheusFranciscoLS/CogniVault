import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiJson } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { Icon } from '../icons/Icon';
import ExplodedView from '../parts-v2/ExplodedView';
import { useMasterPrices } from './master-part-prices';
import PartPriceTag from './PartPriceTag';

type KawasakiAssembly = { name: string; slug: string; viewerUrl: string };
type KawasakiPart = { position: string | null; partNumber: string; name: string; quantity: number | null };
type KawasakiHotspot = { position: string; left: number; top: number };
type KawasakiAssemblyDetail = {
  parts: KawasakiPart[];
  imageUrl: string | null;
  referenceWidth: number | null;
  referenceHeight: number | null;
  hotspots: KawasakiHotspot[];
};
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

  const detailQuery = useQuery({
    queryKey: ['kawasaki-assembly', openSlug],
    enabled: Boolean(openSlug),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      // Modelo e conjunto viajam junto só para o índice de busca do servidor:
      // o slug não informa o modelo, e deduzi-lo dali gravaria o código no
      // motor errado. Sem eles a leitura funciona igual, só não indexa.
      const nome = catalogQuery.data?.assemblies.find(item => item.slug === openSlug)?.name || '';
      const data = await apiJson<{ assembly: KawasakiAssemblyDetail }>(
        `/api/kawasaki/assembly?slug=${encodeURIComponent(openSlug as string)}`
        + `&model=${encodeURIComponent(catalogQuery.data?.model || model)}`
        + (nome ? `&assembly=${encodeURIComponent(nome)}` : ''),
        { timeoutMs: 25_000 },
      );
      return data.assembly;
    },
  });

  const catalog = catalogQuery.data ?? null;
  const openAssembly = catalog?.assemblies.find(item => item.slug === openSlug) ?? null;
  const detail = detailQuery.data ?? null;
  const parts = detail?.parts ?? [];
  // Preço é da loja: a Kawasaki escreve "Please Contact a Dealer" em toda linha.
  const precos = useMasterPrices(parts.map(part => part.partNumber)).data;
  // Peça em foco: o clique numa posição do desenho rola até a linha dela.
  const [focusedPosition, setFocusedPosition] = useState<string | null>(null);

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
          Sem catálogo para este modelo. Confira série e spec na plaqueta.
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

          {detailQuery.isLoading && (
            <div aria-busy="true" className="px-4 py-4 text-xs font-semibold text-ink-500 dark:text-ink-400">
              Lendo o desenho e as peças deste conjunto…
            </div>
          )}

          {/* A vista explodida DENTRO do app, com as posições clicáveis — o
              mesmo `ExplodedView` da Husqvarna, com zoom e arraste.
              As coordenadas vêm da mesma resposta que traz a tabela: o ARI
              marca cada posição com `tag` (a coluna "Ref") e `coords`. */}
          {detail?.imageUrl && (
            <div className="px-4 pb-1 pt-3">
              {detail.hotspots.length > 0 ? (
                <ExplodedView
                  imageUrl={detail.imageUrl}
                  alt={`Vista explodida ${openAssembly.name}`}
                  maxHeight={560}
                  hotspots={detail.hotspots.map((spot, index) => {
                    const peca = parts.find(item => item.position === spot.position);
                    return {
                      key: `${spot.position}-${index}`,
                      left: spot.left,
                      top: spot.top,
                      label: spot.position,
                      onSelect: () => setFocusedPosition(spot.position),
                      tooltip: (
                        <div className="pointer-events-none mb-2 hidden w-56 rounded-xl border border-ink-200 bg-white p-3 text-left shadow-xl group-hover:block group-focus-within:block dark:border-ink-700 dark:bg-ink-900">
                          <div className="text-[10px] font-black text-ink-800 dark:text-ink-100">{peca?.name || 'Posição ' + spot.position}</div>
                          {peca && <div className="mt-1 font-mono text-[11px] font-bold text-ink-900 dark:text-brand-300">{peca.partNumber}</div>}
                          {peca?.quantity ? <div className="mt-1 text-[9px] font-bold text-ink-500 dark:text-ink-400">{peca.quantity} no conjunto</div> : null}
                        </div>
                      ),
                    };
                  })}
                />
              ) : (
                /* Desenho sem posições: a altura da imagem não foi lida, então
                   marcar seria adivinhar onde cada peça está. Mostra o desenho
                   e deixa a leitura para o atendente. */
                <img
                  src={detail.imageUrl}
                  alt={`Vista explodida ${openAssembly.name}`}
                  className="mx-auto max-h-[560px] w-auto rounded-lg bg-white object-contain"
                  loading="lazy"
                />
              )}
            </div>
          )}

          {!detailQuery.isLoading && !parts.length && (
            <div className="px-4 py-3 text-[11px] leading-5 text-ink-500 dark:text-ink-400">
              Leia o código na vista explodida acima.
            </div>
          )}

          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {parts.map(part => (
              <div
                key={`${part.position}-${part.partNumber}`}
                id={`kw-part-${part.position}`}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition ${focusedPosition && focusedPosition === part.position ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''}`}
              >
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
                <PartPriceTag code={part.partNumber} prices={precos} />
                {/* Quantidade só quando a fonte informa. `11061-7057` leva 2 —
                    sem isso o balcão venderia 1 e o cliente voltaria. */}
                {part.quantity && part.quantity > 1 ? (
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    leva {part.quantity}
                  </span>
                ) : null}
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
                        // A quantidade do catálogo, quando existe: é ela que
                        // evita vender 1 onde o conjunto leva 2.
                        quantity: part.quantity || 1,
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
