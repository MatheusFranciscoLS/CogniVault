import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ExternalLink, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiJson, cleanErpCode, formatHusqvarnaPartNumber } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import ExplodedView from './ExplodedView';
import PartLine, { Note } from './PartLine';
import type {
  HusqvarnaOfficialIplPart,
  HusqvarnaOfficialPartDetails,
  HusqvarnaOfficialProductDetails,
  HusqvarnaOfficialRelatedSparePart,
  OfficialFallbackResult,
} from './types';

/**
 * A máquina aberta: vista explodida + peças da vista, com o código a um clique.
 *
 * O produto cuida de vista explodida e orçamento (a venda é no Clipp). Por isso este painel
 * mostra só o que o balcão usa com o cliente na frente: escolher a vista, achar a posição,
 * COPIAR o código e pôr no orçamento. Ficaram de fora, por decisão do dono, especificações,
 * características, acessórios, "também usado em" e as "aplicações" de cada peça: são
 * informação de vitrine, não de balcão.
 *
 * Variantes do mesmo modelo continuam acessíveis (PNC diferente = peça diferente), em um
 * menu, e não como aba.
 */

type Tab = 'IPL' | 'SPARE_PARTS';
type InspectablePart = HusqvarnaOfficialIplPart | HusqvarnaOfficialRelatedSparePart;
type Props = {
  result: OfficialFallbackResult;
  /** Navega para outro PNC dentro da aplicação em vez de recarregar a página. */
  onOpenPnc: (pnc: string) => void;
  /** Leva um código para a busca interna (estoque, localização e preço). */
  onOpenPart: (partNumber: string) => void;
};
type MachinePartMatch = { sectionId: string; sectionName: string; key: string; part: HusqvarnaOfficialIplPart };

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function normalizeSearch(value: unknown): string {
  return String(value || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function sectionShortId(id: string): string {
  return id.replace(/^HVA_PL-/i, '').slice(-8) || id;
}

function partKey(sectionId: string, index: number, part: HusqvarnaOfficialIplPart): string {
  return `${sectionId}|${index}|${part.partNumber || part.position || part.name}`;
}

function domId(key: string): string {
  return `husq-part-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/** Texto do catálogo que decide se a peça serve (serial, variante). O resto é observação. */
function isApplicabilityNote(comment: string): boolean {
  return /(serial|s\/n|série|serie|a partir|até|\bate\b|before|after|from|variant|variante|modelo|model|pnc)/i.test(comment);
}

function hotspotFromCoordinates(
  raw: string | null,
  referenceWidth: number | null,
  referenceHeight: number | null,
): { left: number; top: number } | null {
  if (!raw) return null;
  const values = (raw.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
  if (values.length < 2) return null;
  let x = values[0];
  let y = values[1];

  if (values.length >= 6 && values.length % 2 === 0) {
    const xs = values.filter((_, index) => index % 2 === 0);
    const ys = values.filter((_, index) => index % 2 === 1);
    x = (Math.min(...xs) + Math.max(...xs)) / 2;
    y = (Math.min(...ys) + Math.max(...ys)) / 2;
  } else if (values.length >= 4) {
    const [left, top, third, fourth] = values;
    if (referenceWidth && referenceHeight && third > 0 && fourth > 0 && left + third <= referenceWidth * 1.05 && top + fourth <= referenceHeight * 1.05) {
      x = left + third / 2;
      y = top + fourth / 2;
    } else if (third > left && fourth > top) {
      x = (left + third) / 2;
      y = (top + fourth) / 2;
    }
  }

  if (referenceWidth && referenceHeight && referenceWidth > 0 && referenceHeight > 0) {
    const left = (x / referenceWidth) * 100;
    const top = (y / referenceHeight) * 100;
    if (left < -2 || left > 102 || top < -2 || top > 102) return null;
    return { left: Math.max(0, Math.min(100, left)), top: Math.max(0, Math.min(100, top)) };
  }
  if (x >= 0 && x <= 1.01 && y >= 0 && y <= 1.01) return { left: x * 100, top: y * 100 };
  if (x >= 0 && x <= 100 && y >= 0 && y <= 100) return { left: x, top: y };
  return null;
}

export default function OfficialHusqvarnaPanel({ result, onOpenPnc, onOpenPart }: Props) {
  const quoteCart = useQuoteCart();
  const [tab, setTab] = useState<Tab>('IPL');

  const detailsQuery = useQuery({
    queryKey: ['husqvarna-product-details', result.pnc],
    enabled: Boolean(result.pnc),
    queryFn: async () => {
      const response = await apiJson<{ product: HusqvarnaOfficialProductDetails }>(`/api/husqvarna/products/${encodeURIComponent(result.pnc as string)}/details`, { timeoutMs: 20_000 });
      return response.product;
    },
  });
  const details = detailsQuery.data ?? null;
  const loading = detailsQuery.isLoading;
  const error = detailsQuery.error
    ? (detailsQuery.error instanceof Error ? detailsQuery.error.message : 'Não foi possível carregar as vistas desta máquina.')
    : '';
  const [sectionId, setSectionId] = useState('');
  const [machineSearch, setMachineSearch] = useState('');
  const [selectedParts, setSelectedParts] = useState<Set<string>>(() => new Set());
  const [highlightedPart, setHighlightedPart] = useState<string | null>(null);

  const selectedSection = useMemo(() => {
    if (!details?.iplSections.length) return null;
    return details.iplSections.find(section => section.id === sectionId) || details.iplSections[0];
  }, [details, sectionId]);

  const duplicateSectionNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const section of details?.iplSections || []) counts.set(section.name, (counts.get(section.name) || 0) + 1);
    return counts;
  }, [details]);

  const machineMatches = useMemo<MachinePartMatch[]>(() => {
    const query = normalizeSearch(machineSearch.trim());
    if (!details || query.length < 2) return [];
    const matches: MachinePartMatch[] = [];
    for (const section of details.iplSections) {
      section.parts.forEach((part, index) => {
        const haystack = normalizeSearch([
          section.name, part.position, part.partNumber, part.name, part.description, part.comment,
          part.commercial?.name,
        ].filter(Boolean).join(' '));
        if (!haystack.includes(query)) return;
        matches.push({ sectionId: section.id, sectionName: section.name, key: partKey(section.id, index, part), part });
      });
    }
    return matches.slice(0, 60);
  }, [details, machineSearch]);

  const selectedSectionHotspots = useMemo(() => {
    if (!selectedSection) return [];
    return selectedSection.parts
      .map((part, index) => ({ index, part, point: hotspotFromCoordinates(part.coordinates, selectedSection.referenceWidth, selectedSection.referenceHeight) }))
      .filter(item => item.point !== null);
  }, [selectedSection]);

  const spareCount = details?.spareParts.length || 0;
  const variants = details?.variants || [];
  // Alguns PNCs voltam sem vistas estruturadas: a aba de peças relacionadas assume.
  const activeTab: Tab = tab === 'SPARE_PARTS' && spareCount > 0 ? 'SPARE_PARTS' : (details && !details.iplSections.length && spareCount > 0 ? 'SPARE_PARTS' : 'IPL');

  const quantityInCart = (partNumber: string | null | undefined) => {
    const code = cleanErpCode(partNumber);
    if (!code) return 0;
    return quoteCart.items.find(item => cleanErpCode(item.effectiveCode || item.partNumber) === code)?.quantity ?? 0;
  };

  const copyPart = async (partNumber: string) => {
    const code = cleanErpCode(partNumber);
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Código ${code} copiado.`);
    } catch {
      toast.info(`Código: ${code}`);
    }
  };

  // O link da peça no Portal só vem quando a Husqvarna o informa; senão pergunta uma vez.
  const openOfficialPart = async (part: InspectablePart) => {
    const code = part.partNumber ? cleanErpCode(part.partNumber) : '';
    if (part.url) {
      window.open(part.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!code) return;
    const popup = window.open('about:blank', '_blank');
    try {
      const response = await apiJson<{ part: HusqvarnaOfficialPartDetails }>(`/api/husqvarna/parts/${encodeURIComponent(code)}/details`, { timeoutMs: 20_000 });
      if (!response.part.officialUrl) throw new Error('A Husqvarna não forneceu um link direto para esta peça.');
      if (popup) popup.location.href = response.part.officialUrl;
      else window.open(response.part.officialUrl, '_blank', 'noopener,noreferrer');
    } catch (openError) {
      popup?.close();
      toast.error(openError instanceof Error ? openError.message : 'Não foi possível abrir a peça.');
    }
  };

  const cartItem = (part: HusqvarnaOfficialIplPart | HusqvarnaOfficialRelatedSparePart, section: string | null, position?: string | null, comment?: string | null, quantity?: number | null) => ({
    partNumber: part.partNumber as string,
    effectiveCode: part.partNumber as string,
    manufacturer: 'Husqvarna',
    name: part.commercial?.name || part.name,
    model: details?.model ?? '',
    pnc: details?.pnc,
    section,
    position: position ?? undefined,
    notes: comment ?? undefined,
    unitPrice: part.commercial?.price ?? undefined,
    quantity: quantity && quantity > 0 ? quantity : 1,
  });

  const addToQuote = (part: HusqvarnaOfficialIplPart, sectionName = selectedSection?.name || null) => {
    if (!part.partNumber || !details) return;
    quoteCart.addItem(cartItem(part, sectionName, part.position, part.comment, part.quantity));
  };

  const addSpareToQuote = (part: HusqvarnaOfficialRelatedSparePart) => {
    if (!details) return;
    quoteCart.addItem(cartItem(part, 'Peças de reposição relacionadas'));
  };

  const toggleSelected = (key: string) => {
    setSelectedParts(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };

  const toggleCurrentSection = () => {
    if (!selectedSection) return;
    const codedKeys = selectedSection.parts.map((part, index) => ({ part, key: partKey(selectedSection.id, index, part) })).filter(item => Boolean(item.part.partNumber));
    const allSelected = codedKeys.length > 0 && codedKeys.every(item => selectedParts.has(item.key));
    setSelectedParts(current => {
      const next = new Set(current);
      for (const item of codedKeys) {
        if (allSelected) next.delete(item.key);
        else next.add(item.key);
      }
      return next;
    });
  };

  const addSelectedToQuote = () => {
    if (!details || !selectedParts.size) return;
    const items: Parameters<typeof quoteCart.addItems>[0] = [];
    for (const section of details.iplSections) {
      section.parts.forEach((part, index) => {
        if (!selectedParts.has(partKey(section.id, index, part)) || !part.partNumber) return;
        items.push(cartItem(part, section.name, part.position, part.comment, part.quantity));
      });
    }
    if (!items.length) return;
    quoteCart.addItems(items);
    setSelectedParts(new Set());
  };

  const focusPart = (targetSectionId: string, key: string) => {
    setTab('IPL');
    setSectionId(targetSectionId);
    setHighlightedPart(key);
    window.setTimeout(() => document.getElementById(domId(key))?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    window.setTimeout(() => setHighlightedPart(current => current === key ? null : current), 2500);
  };

  const menuFor = (part: InspectablePart) => {
    const code = part.partNumber ? cleanErpCode(part.partNumber) : '';
    return [
      { label: 'Ver preço e estoque', onSelect: () => onOpenPart(code) },
      { label: 'Ver na Husqvarna', onSelect: () => void openOfficialPart(part) },
    ];
  };

  const noteBlocks = (part: HusqvarnaOfficialIplPart) => (
    <>
      {part.comment && <Note tone={isApplicabilityNote(part.comment) ? 'warn' : 'muted'}>{part.comment}</Note>}
      {part.servesThisPnc === false && <Note tone="warn">Peça de outra variante deste modelo. O catálogo não a lista para este PNC.</Note>}
      {part.multipackQuantity ? <Note>Vendida em pacote fechado de {part.multipackQuantity} unidades.</Note> : null}
      {part.engine ? (
        <Note>
          {part.engine.model ? `Motor ${part.engine.brand ? `${part.engine.brand} ` : ''}${part.engine.model}` : `Motor ${part.engine.brand || 'de terceiro'}`}
          {part.engine.modelOnPlate && ' · Leia o modelo e a spec na plaqueta do motor.'}
          {part.engine.manualUrl && <a href={part.engine.manualUrl} target="_blank" rel="noreferrer noopener" className="ml-2 inline-flex items-center gap-1 font-semibold text-foreground underline underline-offset-4">Catálogo do motor <ExternalLink className="size-3.5" aria-hidden="true" /></a>}
        </Note>
      ) : null}
    </>
  );

  return (
    <section aria-label="Vistas explodidas da máquina" className="space-y-4">
      {error && <p role="alert" className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-base text-destructive">{error}</p>}
      {loading && <p aria-busy="true" className="py-10 text-center text-base text-muted-foreground">Abrindo as vistas desta máquina…</p>}

      {details && (
        <>
          <div className="relative flex flex-wrap items-center gap-2">
            <div className="relative min-w-64 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={machineSearch} onChange={event => setMachineSearch(event.target.value)} placeholder="Buscar nesta máquina: código, nome ou posição" aria-label="Buscar nesta máquina" className="h-11 pl-10" />
              {machineSearch.trim().length >= 2 && (
                <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                  {machineMatches.length ? machineMatches.map(match => (
                    <button key={match.key} type="button" onClick={() => { focusPart(match.sectionId, match.key); setMachineSearch(''); }} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
                      <span className="min-w-0">
                        <span className="block truncate text-base font-semibold">{match.part.commercial?.name || match.part.name}</span>
                        <span className="block truncate text-sm text-muted-foreground">{match.sectionName} · posição {match.part.position || '—'}</span>
                      </span>
                      <span translate="no" className="shrink-0 font-code text-lg font-semibold tabular-nums">{match.part.partNumber ? formatHusqvarnaPartNumber(cleanErpCode(match.part.partNumber)) : 'sem código'}</span>
                    </button>
                  )) : <p className="px-3 py-4 text-center text-base text-muted-foreground">Nada encontrado nas vistas desta máquina.</p>}
                </div>
              )}
            </div>

            {variants.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-11">Variante {details.pnc}<ChevronDown className="size-4" aria-hidden="true" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-72">
                  {variants.map(variant => (
                    <DropdownMenuItem key={variant.pnc} onSelect={() => { if (variant.pnc !== details.pnc) onOpenPnc(variant.pnc); }} className="h-auto min-h-10 flex-col items-start gap-0 py-2">
                      <span translate="no" className="font-code text-lg font-semibold tabular-nums">{variant.pnc}{variant.pnc === details.pnc ? ' · aberta' : ''}</span>
                      {variant.description && <span className="text-sm text-muted-foreground">{variant.description}</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {(details.portalUrl || result.url) && (
              <Button asChild variant="outline" className="h-11">
                <a href={details.portalUrl || result.url || '#'} target="_blank" rel="noreferrer noopener">Portal Husqvarna <ExternalLink className="size-4" aria-hidden="true" /></a>
              </Button>
            )}
          </div>

          {spareCount > 0 && details.iplSections.length > 0 && (
            <div role="tablist" aria-label="Conteúdo da máquina" className="flex gap-2">
              {([['IPL', `Vistas explodidas · ${details.iplSections.length}`], ['SPARE_PARTS', `Peças relacionadas · ${spareCount}`]] as const).map(([id, label]) => (
                <Button key={id} role="tab" aria-selected={activeTab === id} variant="outline" size="sm" className={activeTab === id ? 'border-ring bg-selected' : undefined} onClick={() => setTab(id)}>{label}</Button>
              ))}
            </div>
          )}

          {activeTab === 'IPL' && (
            details.iplSections.length === 0 ? (
              <p className="py-8 text-center text-base text-muted-foreground">Este PNC não retornou vistas explodidas.</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[216px_minmax(0,1fr)]">
                <nav aria-label="Vistas da máquina" className="max-h-[calc(100vh-260px)] space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-1.5 lg:sticky lg:top-0">
                  {details.iplSections.map(section => {
                    const duplicate = (duplicateSectionNames.get(section.name) || 0) > 1;
                    const active = selectedSection?.id === section.id;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        aria-current={active ? 'true' : undefined}
                        onClick={() => setSectionId(section.id)}
                        className={cn('w-full rounded-md px-3 py-2 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60', active ? 'bg-selected font-semibold' : 'hover:bg-accent')}
                      >
                        <span className="block text-base leading-5">{section.name}{duplicate && <span translate="no" className="ml-1 font-code text-sm text-muted-foreground">· {sectionShortId(section.id)}</span>}</span>
                        <span className="block text-sm font-normal text-muted-foreground">{section.parts.length} posições</span>
                      </button>
                    );
                  })}
                </nav>

                {selectedSection && (
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-xl font-semibold leading-7">{selectedSection.name}</h3>
                      <Button variant="outline" size="sm" onClick={toggleCurrentSection}>Selecionar todas desta vista</Button>
                    </div>

                    {selectedSection.imageUrl && (
                      <ExplodedView
                        imageUrl={selectedSection.imageUrl}
                        alt={`Vista explodida ${selectedSection.name}`}
                        hotspots={selectedSectionHotspots.flatMap(({ index, part, point }) => {
                          if (!point) return [];
                          const key = partKey(selectedSection.id, index, part);
                          return [{
                            key,
                            left: point.left,
                            top: point.top,
                            label: part.position || '•',
                            active: highlightedPart === key,
                            onSelect: () => focusPart(selectedSection.id, key),
                            tooltip: (
                              <div className="pointer-events-none mb-2 hidden w-64 rounded-lg border border-border bg-popover p-3 text-left text-popover-foreground shadow-lg group-hover:block group-focus-within:block">
                                <div className="text-sm font-semibold">{part.commercial?.name || part.name}</div>
                                {part.partNumber && <div translate="no" className="mt-1 font-code text-lg font-semibold tabular-nums">{formatHusqvarnaPartNumber(cleanErpCode(part.partNumber))}</div>}
                                {part.commercial?.price != null && <div className="font-code text-base font-bold tabular-nums">{brl.format(part.commercial.price)}</div>}
                              </div>
                            ),
                          }];
                        })}
                      />
                    )}

                    <div className="space-y-2">
                      {selectedSection.parts.map((part, index) => {
                        const key = partKey(selectedSection.id, index, part);
                        const code = part.partNumber ? cleanErpCode(part.partNumber) : '';
                        return (
                          <PartLine
                            key={key}
                            anchorId={domId(key)}
                            position={part.position}
                            name={part.commercial?.name || part.name}
                            code={code}
                            displayCode={formatHusqvarnaPartNumber(code)}
                            price={part.commercial?.price}
                            quantity={part.quantity}
                            notes={noteBlocks(part)}
                            replaces={part.replacementPartNumbers?.map(value => formatHusqvarnaPartNumber(cleanErpCode(value)))}
                            selected={selectedParts.has(key)}
                            highlighted={highlightedPart === key}
                            inCart={quantityInCart(part.partNumber)}
                            onToggleSelect={() => toggleSelected(key)}
                            onCopy={() => void copyPart(code)}
                            onAdd={() => addToQuote(part)}
                            menu={menuFor(part)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          {activeTab === 'SPARE_PARTS' && (
            <div className="space-y-2">
              {details.spareParts.map(part => {
                const code = cleanErpCode(part.partNumber);
                return (
                  <PartLine
                    key={part.partNumber}
                    name={part.commercial?.name || part.name}
                    code={code}
                    displayCode={formatHusqvarnaPartNumber(code)}
                    price={part.commercial?.price}
                    imageUrl={part.imageUrl}
                    inCart={quantityInCart(part.partNumber)}
                    onCopy={() => void copyPart(code)}
                    onAdd={() => addSpareToQuote(part)}
                    menu={menuFor(part)}
                  />
                );
              })}
            </div>
          )}

          {selectedParts.size > 0 && (
            <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ring bg-card px-4 py-3 shadow-lg">
              <span className="text-base font-semibold">{selectedParts.size} {selectedParts.size === 1 ? 'peça selecionada' : 'peças selecionadas'}</span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setSelectedParts(new Set())}>Limpar</Button>
                <Button onClick={addSelectedToQuote}>Adicionar ao orçamento</Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
