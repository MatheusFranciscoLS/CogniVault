import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiJson, cleanErpCode } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PartLine, { Note } from '../parts-v2/PartLine';
import ExplodedView from '../parts-v2/ExplodedView';
import { useMasterPrices } from './master-part-prices';
import PartPriceTag from './PartPriceTag';

type KohlerGroup = { sectionId: string; groupCode: string; name: string };
type KohlerSubstitution = { code: string; note: string | null };
type KohlerPart = {
  position: string | null;
  partNumber: string;
  name: string;
  quantity: number | null;
  note: string | null;
  kit: string | null;
  includedIn: string | null;
  replaces: KohlerSubstitution[];
  replacedBy: KohlerSubstitution[];
  discontinued: boolean;
};
type KohlerGroupDetail = {
  title: string | null;
  parts: KohlerPart[];
  imageUrl: string | null;
  hotspots: Array<{ position: string; left: number; top: number }>;
  referenceWidth: number | null;
  referenceHeight: number | null;
};
type KohlerCatalog = {
  spec: string;
  description: string | null;
  groups: KohlerGroup[];
  catalogUrl: string;
  lookupUrl: string;
};

/**
 * Catálogo de peças do motor Kohler, dentro do atendimento.
 *
 * Mesmo desenho do painel da Kawasaki, e pela mesma regra do dono: *"se você não deu um retorno com o código, pelo menos dê um
 * retorno com a vista explodida"*. Cada grupo mostra o desenho com as posições clicáveis **e** a lista de códigos.
 *
 * O que a Kohler dá a mais: a substituição de código. A linha diz o que o código substitui e, quando foi trocado, por qual. Código
 * descontinuado ("DISC.") não vira sugestão de pedido.
 */
/** Grupo das peças que giram rápido (filtros, velas, correias): o que o balcão vende na manutenção do motor. */
const isKohlerMaintenanceGroup = (name: string) => /maintenance|fast moving/i.test(name);

export default function KohlerEnginePanel({
  model,
  autoOpen,
  onSearchPart,
}: {
  model: string;
  /** `maintenance` abre direto o grupo de peças de manutenção. */
  autoOpen?: 'maintenance';
  /** Leva um código para a busca interna, onde há preço e estoque. */
  onSearchPart: (code: string) => void;
}) {
  const quoteCart = useQuoteCart();
  // `undefined` = o balcão ainda não escolheu: vale o atalho (autoOpen). Depois da primeira escolha, vale ela (inclusive fechar).
  const [chosenSection, setChosenSection] = useState<string | null | undefined>(undefined);

  const catalogQuery = useQuery({
    queryKey: ['kohler-engine', model],
    enabled: Boolean(model),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const data = await apiJson<{ kohler: KohlerCatalog }>(`/api/kohler/engine?model=${encodeURIComponent(model)}`, { timeoutMs: 30_000 });
      return data.kohler ?? null;
    },
  });

  const catalog = catalogQuery.data ?? null;
  const spec = catalog?.spec || model;
  // Peças de manutenção primeiro: é o que o balcão procura (filtro, vela), e o grupo fica no fim da lista da Kohler.
  const groups = [...(catalog?.groups ?? [])].sort((a, b) => Number(isKohlerMaintenanceGroup(b.name)) - Number(isKohlerMaintenanceGroup(a.name)));
  const maintenanceId = groups.find(group => isKohlerMaintenanceGroup(group.name))?.sectionId ?? null;
  const openSection = chosenSection === undefined ? (autoOpen === 'maintenance' ? maintenanceId : null) : chosenSection;
  const openGroup = catalog?.groups.find(item => item.sectionId === openSection) ?? null;

  const groupQuery = useQuery({
    queryKey: ['kohler-group', spec, openSection],
    enabled: Boolean(openSection) && Boolean(catalog?.description),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const data = await apiJson<{ group: KohlerGroupDetail | null }>(
        `/api/kohler/group?model=${encodeURIComponent(spec)}&section=${encodeURIComponent(openSection as string)}`,
        { timeoutMs: 30_000 },
      );
      return data.group ?? null;
    },
  });

  const detail = groupQuery.data ?? null;
  const parts = detail?.parts ?? [];
  // Preço é da loja: a Kohler não publica preço no catálogo.
  const priceQuery = useMasterPrices(parts.map(part => part.partNumber));
  const precos = priceQuery.data?.prices;
  const precoDegradado = priceQuery.data?.degraded === true;
  const [focusedPosition, setFocusedPosition] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const termo = filtro.trim().toLocaleLowerCase('pt-BR');
  const visiveis = termo
    ? parts.filter(part => `${part.partNumber} ${part.name} ${part.position ?? ''}`.toLocaleLowerCase('pt-BR').includes(termo))
    : parts;

  const copy = (code: string) => {
    void navigator.clipboard.writeText(code).then(
      () => toast.success(`Código ${code} copiado.`),
      () => toast.error(`Não foi possível copiar. Anote: ${code}`),
    );
  };

  const noOrcamento = (codigo: string) => quoteCart.items.find(item => cleanErpCode(item.effectiveCode || item.partNumber) === cleanErpCode(codigo))?.quantity ?? 0;

  if (catalogQuery.isLoading) {
    return <section aria-busy="true" className="rounded-xl border border-border bg-card px-5 py-4 text-base text-muted-foreground">Abrindo o catálogo Kohler de {model}…</section>;
  }

  if (!catalog) return null;

  return (
    <section aria-label={`Motor Kohler ${catalog.spec}`} className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h3 className="min-w-0 truncate text-lg font-semibold">
          Motor Kohler · <span translate="no" className="font-code tabular-nums">{catalog.spec}</span>
          {catalog.description && <span className="ml-2 text-base font-normal text-muted-foreground">{catalog.description}</span>}
        </h3>
        <Button asChild variant="ghost" size="sm">
          <a href={catalog.description ? catalog.catalogUrl : catalog.lookupUrl} target="_blank" rel="noreferrer noopener">Catálogo oficial<ExternalLink className="size-3.5" aria-hidden="true" /></a>
        </Button>
      </div>

      {!catalog.description && (
        <p className="px-5 py-4 text-base text-muted-foreground">Sem catálogo para este spec. Confira a série e o spec na plaqueta do motor.</p>
      )}

      {catalog.groups.length > 0 && (
        <div className="px-5 py-4">
          {precoDegradado ? (
            <p role="status" className="mb-3 rounded-md border border-warn bg-warn-soft px-3 py-2 text-base text-warn">
              Preços da loja temporariamente indisponíveis. Os códigos continuam disponíveis; confirme o valor antes de fechar.
            </p>
          ) : null}
          <h4 className="text-base font-semibold text-muted-foreground">Grupos</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {groups.map(group => (
              <Button
                key={group.sectionId}
                variant="outline"
                aria-pressed={openSection === group.sectionId}
                className={openSection === group.sectionId ? 'border-ring bg-selected' : undefined}
                onClick={() => { setFiltro(''); setFocusedPosition(null); setChosenSection(openSection === group.sectionId ? null : group.sectionId); }}
              >
                {group.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {openGroup && (
        <div className="space-y-3 border-t border-border px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="min-w-0 truncate text-xl font-semibold">{openGroup.name}</h4>
            <Button asChild variant="outline">
              <a href={`${catalog.catalogUrl}&SectionId=${encodeURIComponent(openGroup.sectionId)}&GroupCode=${encodeURIComponent(openGroup.groupCode)}`} target="_blank" rel="noreferrer noopener">Ver no catálogo da Kohler<ExternalLink className="size-4" aria-hidden="true" /></a>
            </Button>
          </div>

          {groupQuery.isLoading && <p aria-busy="true" className="py-4 text-base text-muted-foreground">Lendo o desenho e as peças deste grupo…</p>}

          {detail?.imageUrl && (
            detail.referenceWidth && detail.referenceHeight ? (
              <ExplodedView
                imageUrl={detail.imageUrl}
                aspectRatio={detail.referenceWidth / detail.referenceHeight}
                alt={`Vista explodida ${openGroup.name}`}
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
                      window.setTimeout(() => document.getElementById(`kh-part-${spot.position}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                    },
                    tooltip: (
                      <div className="pointer-events-none mb-2 hidden w-60 rounded-lg border border-border bg-popover p-3 text-left text-popover-foreground shadow-lg group-hover:block group-focus-within:block">
                        <div className="text-sm font-semibold">{peca?.name || `Posição ${spot.position}`}</div>
                        {peca && <div translate="no" className="mt-1 font-code text-lg font-semibold tabular-nums">{peca.partNumber}</div>}
                        {peca?.quantity ? <div className="text-sm text-muted-foreground">{peca.quantity} no grupo</div> : null}
                      </div>
                    ),
                  };
                })}
              />
            ) : (
              /* Sem a proporção do desenho (o SVG não pôde ser lido): mostra o desenho e deixa a leitura para o atendente; marcar sem
                 saber a escala seria adivinhar onde cada peça está. */
              <img src={detail.imageUrl} alt={`Vista explodida ${openGroup.name}`} className="mx-auto w-full rounded-lg bg-white" loading="lazy" />
            )
          )}

          {!groupQuery.isLoading && !parts.length && <p className="text-base text-muted-foreground">Sem peças neste grupo. Leia o código na vista explodida.</p>}

          {parts.length > 6 && (
            <Input value={filtro} onChange={event => setFiltro(event.target.value)} placeholder="Filtrar por código ou nome" aria-label="Filtrar peças do grupo" className="h-10 w-64" />
          )}
          {termo && !visiveis.length && <p className="text-base text-muted-foreground">Nada com &quot;{filtro}&quot; neste grupo.</p>}

          <div className="space-y-2">
            {visiveis.map(part => {
              // Código novo que substitui este: o atendente pede o novo, não o antigo.
              const novo = part.replacedBy[0]?.code ?? null;
              return (
                <PartLine
                  key={`${part.position}-${part.partNumber}`}
                  anchorId={`kh-part-${part.position}`}
                  position={part.position}
                  name={part.name || part.partNumber}
                  badges={part.discontinued ? <span className="rounded-sm bg-warn-soft px-1.5 text-sm font-semibold text-warn">Descontinuada</span> : null}
                  notes={(
                    <>
                      {novo && <Note tone="warn">Substituída pelo código {novo}{part.replacedBy[0]?.note ? ` (${part.replacedBy[0].note})` : ''}.</Note>}
                      {part.note && <Note tone="warn">{part.note}</Note>}
                      {part.kit && <Note>Vem no kit {part.kit}.</Note>}
                      {part.includedIn && <Note>Incluída em {part.includedIn}.</Note>}
                    </>
                  )}
                  /* Cru, como a Kohler publica ("20 014 47-S"): é o código do pedido. Limpo para a lista da loja só na consulta de preço. */
                  code={part.partNumber}
                  replaces={part.replaces.map(item => item.code)}
                  quantity={part.quantity}
                  highlighted={focusedPosition !== null && focusedPosition === part.position}
                  priceSlot={<PartPriceTag code={part.partNumber} prices={precos} />}
                  inCart={noOrcamento(part.partNumber)}
                  onCopy={() => copy(part.partNumber)}
                  onAdd={() => {
                    quoteCart.addItem({
                      partNumber: part.partNumber,
                      manufacturer: 'Kohler',
                      name: part.name || part.partNumber,
                      model: catalog.spec,
                      section: openGroup.name,
                      position: part.position || undefined,
                      // A quantidade do catálogo, quando existe: evita vender 1 onde o grupo leva 2.
                      quantity: part.quantity || 1,
                    });
                  }}
                  menu={[
                    { label: 'Ver preço e estoque', onSelect: () => onSearchPart(part.partNumber) },
                    ...(novo ? [{ label: `Ver o código novo ${novo}`, onSelect: () => onSearchPart(novo) }] : []),
                  ]}
                />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
