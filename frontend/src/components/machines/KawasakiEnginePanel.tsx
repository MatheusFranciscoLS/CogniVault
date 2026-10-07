import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiJson, cleanErpCode } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PartLine from '../parts-v2/PartLine';
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
      return data.kawasaki ?? null;
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
      return data.assembly ?? null;
    },
  });

  const catalog = catalogQuery.data ?? null;
  const openAssembly = catalog?.assemblies.find(item => item.slug === openSlug) ?? null;
  const detail = detailQuery.data ?? null;
  const parts = detail?.parts ?? [];
  // Preço é da loja: a Kawasaki escreve "Please Contact a Dealer" em toda linha.
  const priceQuery = useMasterPrices(parts.map(part => part.partNumber));
  const precos = priceQuery.data?.prices;
  const precoDegradado = priceQuery.data?.degraded === true;
  // Peça em foco: o clique numa posição do desenho rola até a linha dela.
  const [focusedPosition, setFocusedPosition] = useState<string | null>(null);

  const copy = (code: string) => {
    void navigator.clipboard.writeText(code).then(
      () => toast.success(`Código ${code} copiado.`),
      () => toast.error(`Não foi possível copiar. Anote: ${code}`),
    );
  };

  const noOrcamento = (codigo: string) => quoteCart.items.find(item => cleanErpCode(item.effectiveCode || item.partNumber) === cleanErpCode(codigo))?.quantity ?? 0;

  if (catalogQuery.isLoading) {
    return <section aria-busy="true" className="rounded-xl border border-border bg-card px-5 py-4 text-base text-muted-foreground">Abrindo o catálogo Kawasaki de {model}…</section>;
  }

  if (!catalog) return null;

  return (
    <section aria-label={`Motor Kawasaki ${catalog.fullName || catalog.model}`} className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h3 className="min-w-0 truncate text-lg font-semibold">Motor Kawasaki · <span translate="no" className="font-code tabular-nums">{catalog.fullName || catalog.model}</span></h3>
        <Button asChild variant="ghost" size="sm">
          <a href={catalog.lookupUrl} target="_blank" rel="noreferrer noopener">Catálogo oficial<ExternalLink className="size-3.5" aria-hidden="true" /></a>
        </Button>
      </div>

      {/* Série sem spec: a pergunta certa, não um erro. */}
      {catalog.needsSpec.length > 0 && (
        <div className="px-5 py-4">
          <p className="text-base font-semibold">Este motor tem {catalog.needsSpec.length} versões. Qual é o spec da plaqueta?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {catalog.needsSpec.map(option => {
              const spec = option.trim().split(/\s+/)[0];
              return <Button key={option} variant="outline" onClick={() => onSearchPart(spec)}><span translate="no" className="font-code tabular-nums">{spec}</span></Button>;
            })}
          </div>
        </div>
      )}

      {catalog.assemblies.length === 0 && catalog.needsSpec.length === 0 && (
        <p className="px-5 py-4 text-base text-muted-foreground">Sem catálogo para este modelo. Confira série e spec na plaqueta.</p>
      )}

      {catalog.assemblies.length > 0 && (
        <div className="px-5 py-4">
          {precoDegradado ? (
            <p role="status" className="mb-3 rounded-md border border-warn bg-warn-soft px-3 py-2 text-base text-warn">
              Preços da loja temporariamente indisponíveis. Os códigos continuam disponíveis; confirme o valor antes de fechar.
            </p>
          ) : null}
          <h4 className="text-base font-semibold text-muted-foreground">Conjuntos</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {catalog.assemblies.map(assembly => (
              <Button
                key={assembly.slug}
                variant="outline"
                aria-pressed={openSlug === assembly.slug}
                className={openSlug === assembly.slug ? 'border-ring bg-selected' : undefined}
                onClick={() => setOpenSlug(current => (current === assembly.slug ? null : assembly.slug))}
              >
                {assembly.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {openAssembly && (
        <div className="space-y-3 border-t border-border px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="min-w-0 truncate text-xl font-semibold">{openAssembly.name}</h4>
            {/* A vista explodida ao lado dos códigos, sempre. É a saída quando a
                descrição em inglês não basta para o atendente decidir. */}
            <Button asChild variant="outline">
              <a href={openAssembly.viewerUrl} target="_blank" rel="noreferrer noopener">Ver vista explodida<ExternalLink className="size-4" aria-hidden="true" /></a>
            </Button>
          </div>

          {detailQuery.isLoading && <p aria-busy="true" className="py-4 text-base text-muted-foreground">Lendo o desenho e as peças deste conjunto…</p>}

          {/* A vista explodida DENTRO do app, com as posições clicáveis — o
              mesmo `ExplodedView` da Husqvarna, com zoom e arraste.
              As coordenadas vêm da mesma resposta que traz a tabela: o ARI
              marca cada posição com `tag` (a coluna "Ref") e `coords`. */}
          {detail?.imageUrl && (
            detail.hotspots.length > 0 ? (
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
                    active: focusedPosition === spot.position,
                    onSelect: () => {
                      setFocusedPosition(spot.position);
                      window.setTimeout(() => document.getElementById(`kw-part-${spot.position}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                    },
                    tooltip: (
                      <div className="pointer-events-none mb-2 hidden w-60 rounded-lg border border-border bg-popover p-3 text-left text-popover-foreground shadow-lg group-hover:block group-focus-within:block">
                        <div className="text-sm font-semibold">{peca?.name || `Posição ${spot.position}`}</div>
                        {peca && <div translate="no" className="mt-1 font-code text-lg font-semibold tabular-nums">{peca.partNumber}</div>}
                        {peca?.quantity ? <div className="text-sm text-muted-foreground">{peca.quantity} no conjunto</div> : null}
                      </div>
                    ),
                  };
                })}
              />
            ) : (
              /* Desenho sem posições: a altura da imagem não foi lida, então
                 marcar seria adivinhar onde cada peça está. Mostra o desenho
                 e deixa a leitura para o atendente. */
              <img src={detail.imageUrl} alt={`Vista explodida ${openAssembly.name}`} className="mx-auto max-h-[560px] w-auto rounded-lg bg-white object-contain" loading="lazy" />
            )
          )}

          {!detailQuery.isLoading && !parts.length && <p className="text-base text-muted-foreground">Leia o código na vista explodida acima.</p>}

          <div className="space-y-2">
            {parts.map(part => (
              <PartLine
                key={`${part.position}-${part.partNumber}`}
                anchorId={`kw-part-${part.position}`}
                position={part.position}
                name={part.name || part.partNumber}
                /* Cru, como a Kawasaki publica. NÃO passar por `cleanErpCode`:
                   ele remove o hífen, e `15004-0937` sem o hífen não é código
                   de nada. */
                code={part.partNumber}
                /* Quantidade só quando a fonte informa. `11061-7057` leva 2 —
                   sem isso o balcão venderia 1 e o cliente voltaria. */
                quantity={part.quantity}
                highlighted={focusedPosition !== null && focusedPosition === part.position}
                priceSlot={<PartPriceTag code={part.partNumber} prices={precos} />}
                inCart={noOrcamento(part.partNumber)}
                onCopy={() => copy(part.partNumber)}
                onAdd={() => {
                  quoteCart.addItem({
                    partNumber: part.partNumber,
                    manufacturer: 'Kawasaki',
                    name: part.name || part.partNumber,
                    model: catalog.fullName || catalog.model,
                    section: openAssembly.name,
                    position: part.position || undefined,
                    // A quantidade do catálogo, quando existe: é ela que
                    // evita vender 1 onde o conjunto leva 2.
                    quantity: part.quantity || 1,
                  });
                }}
                /* Preço e estoque são nossos, não da Kawasaki: ela publica
                   "Please Contact a Dealer" em toda linha. */
                menu={[{ label: 'Ver preço e estoque', onSelect: () => onSearchPart(part.partNumber) }]}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
