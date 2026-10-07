import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '../context/confirm';
import { useQuoteCart } from '../context/QuoteCartContext';
import type { SavedQuote } from '../context/QuoteCartContext';
import { apiJson, cleanErpCode, formatHusqvarnaPartNumber } from '../lib';
import { ChevronRight, Copy, Search, Trash2 } from 'lucide-react';
import { playCopySound } from '../lib/sound';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

interface ApiQuoteListItem {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string | null;
  machineModel: string | null;
  discountPercentage: number;
  totalItems: number;
  grossTotal: number;
  netTotal: number;
  createdAt: string;
  savedAt: string | null;
  attendantEmail: string | null;
  items: Array<{
    partNumber: string;
    effectiveCode: string | null;
    manufacturer: string | null;
    name: string;
    model: string | null;
    pnc: string | null;
    section: string | null;
    position: string | null;
    filename: string | null;
    page: number | null;
    isSuperseded: boolean;
    originalCode: string | null;
    notes: string | null;
    isService: boolean;
    quantity: number;
    unitPrice: number | null;
  }>;
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function toSavedQuote(quote: ApiQuoteListItem): SavedQuote {
  return {
    id: quote.id,
    createdAt: quote.savedAt || quote.createdAt,
    customerName: quote.customerName ?? undefined,
    customerPhone: quote.customerPhone ?? undefined,
    paymentMethod: quote.paymentMethod ?? undefined,
    machineModel: quote.machineModel ?? undefined,
    discountPercentage: quote.discountPercentage || undefined,
    totalPrice: quote.grossTotal,
    totalItems: quote.totalItems,
    attendantEmail: quote.attendantEmail,
    items: quote.items.map(item => ({
      id: `${item.partNumber}|${item.manufacturer || ''}|${item.model || ''}|${item.pnc || ''}`,
      partNumber: item.partNumber,
      effectiveCode: item.effectiveCode ?? undefined,
      manufacturer: item.manufacturer,
      name: item.name,
      model: item.model ?? '',
      pnc: item.pnc,
      section: item.section,
      position: item.position,
      filename: item.filename,
      page: item.page,
      isSuperseded: item.isSuperseded,
      originalCode: item.originalCode ?? undefined,
      notes: item.notes,
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? undefined,
    })),
  };
}

const ROW_GRID = 'lg:grid-cols-[minmax(170px,1.1fr)_130px_minmax(200px,1.4fr)_minmax(120px,0.9fr)_150px_170px]';

function copyCode(code: string) {
  const clean = cleanErpCode(code);
  void navigator.clipboard.writeText(clean);
  playCopySound();
  toast.success(`Código ${clean} copiado.`);
}

export default function SavedQuotesPanel() {
  const { restoreQuote, deleteSavedQuote, refreshSavedQuotes } = useQuoteCart();
  const confirm = useConfirm();

  const [filter, setFilter] = useState('');
  const [appliedFilter, setAppliedFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [quotes, setQuotes] = useState<ApiQuoteListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Recarga manual (depois de excluir) sem duplicar a lógica de busca: o efeito
  // é a única coisa que fala com a API, e este contador é o gatilho.
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadToken(value => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ take: String(PAGE_SIZE), skip: String(page * PAGE_SIZE) });
    if (appliedFilter) params.set('q', appliedFilter);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    void apiJson<{ quotes: ApiQuoteListItem[]; total: number }>(`/api/quotes?${params.toString()}`)
      .then(data => {
        if (!active) return;
        setQuotes(data.quotes);
        setTotal(data.total);
        setError('');
        setLoading(false);
      })
      .catch(requestError => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os orçamentos.');
        setLoading(false);
      });

    return () => { active = false; };
  }, [appliedFilter, from, page, to, reloadToken]);

  // A busca é no servidor porque o histórico agora é do banco, não do
  // navegador: filtrar em memória só acharia a primeira página.
  //
  // Sempre passa por `reload()`: ligar só o "Carregando…" sem nada que dispare a busca (filtro igual ao que já
  // estava aplicado, ou datas que já recarregaram a lista) deixava a tela presa em "Carregando orçamentos…".
  const applyFilter = () => {
    setPage(0);
    setAppliedFilter(filter.trim());
    reload();
  };

  const clearFilters = () => {
    setFilter('');
    setAppliedFilter('');
    setFrom('');
    setTo('');
    setPage(0);
    reload();
  };

  const handleRestore = async (quote: ApiQuoteListItem) => {
    if (!(await confirm({ title: 'Retomar este orçamento?', description: 'Os itens da cesta atual serão substituídos pelos deste orçamento.', confirmLabel: 'Retomar' }))) return;
    restoreQuote(toSavedQuote(quote));
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ title: 'Excluir este orçamento?', description: 'Ele sai do histórico e não dá para desfazer.', confirmLabel: 'Excluir', destructive: true }))) return;
    await deleteSavedQuote(id);
    await refreshSavedQuotes();
    reload();
    toast.success('Orçamento excluído.');
  };

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const hasFilters = Boolean(appliedFilter || from || to);

  return (
    <section className="mx-auto w-full max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Orçamentos</h1>
        <p className="text-base text-muted-foreground tabular-nums">
          {total} {total === 1 ? 'orçamento arquivado' : 'orçamentos arquivados'}
        </p>
      </div>

      <form
        onSubmit={event => { event.preventDefault(); applyFilter(); }}
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:flex-row md:items-end"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor="quote-filter" className="block text-sm font-medium text-muted-foreground">Cliente, telefone, código ou modelo</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="quote-filter"
              value={filter}
              onChange={event => setFilter(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="Ex.: Sr. Carlos, 143RII ou 5450361-01"
              className="pl-9 text-base"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="quote-from" className="block text-sm font-medium text-muted-foreground">De</label>
          <Input id="quote-from" type="date" value={from} onChange={e => { setPage(0); setFrom(e.target.value); }} className="w-full tabular-nums md:w-40" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="quote-to" className="block text-sm font-medium text-muted-foreground">Até</label>
          <Input id="quote-to" type="date" value={to} onChange={e => { setPage(0); setTo(e.target.value); }} className="w-full tabular-nums md:w-40" />
        </div>
        <div className="flex gap-2">
          <Button type="submit">Buscar</Button>
          {hasFilters && <Button type="button" variant="ghost" onClick={clearFilters}>Limpar</Button>}
        </div>
      </form>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-base font-medium text-destructive">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className={cn('hidden h-10 items-center gap-x-4 border-b border-border bg-muted px-4 text-sm font-semibold text-muted-foreground lg:grid', ROW_GRID)}>
          <span>Cliente</span><span>Data</span><span>Conteúdo</span><span>Atendente</span><span className="text-right">Total</span><span />
        </div>

        {loading ? (
          <div aria-hidden="true">
            <span role="status" className="sr-only">Carregando orçamentos…</span>
            {[0, 1, 2].map(item => (
              <div key={item} className={cn('grid items-center gap-x-4 gap-y-2 border-b border-border px-4 py-4 last:border-0', ROW_GRID)}>
                <div className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-28" /></div>
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-6 w-24 lg:ml-auto" />
                <Skeleton className="h-10 w-24 lg:ml-auto" />
              </div>
            ))}
          </div>
        ) : quotes.length ? (
          quotes.map(quote => {
            const reference = quote.savedAt || quote.createdAt;
            const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(reference));
            const firstItem = quote.items[0];
            const extraItems = Math.max(0, quote.items.length - 1);
            const expanded = expandedId === quote.id;

            return (
              <article key={quote.id} className="border-b border-border last:border-0">
                <div className={cn('grid items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-muted', ROW_GRID)}>
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{quote.customerName || 'Cliente não informado'}</div>
                    <div className="truncate text-sm text-muted-foreground">{quote.customerPhone || 'Sem telefone'}</div>
                  </div>
                  <div className="text-base text-muted-foreground tabular-nums">{date}</div>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : quote.id)}
                      aria-expanded={expanded}
                      className="flex max-w-full items-center gap-1 rounded-sm text-left text-base font-semibold outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
                    >
                      <ChevronRight className={cn('size-4 shrink-0 transition-transform', expanded && 'rotate-90')} aria-hidden="true" />
                      <span className="truncate">{firstItem ? firstItem.name : 'Sem itens'}</span>
                    </button>
                    <div className="text-sm text-muted-foreground tabular-nums">
                      {quote.totalItems} {quote.totalItems === 1 ? 'item' : 'itens'}
                      {quote.machineModel ? ` · ${quote.machineModel}` : firstItem?.model ? ` · ${firstItem.model}` : ''}
                      {extraItems > 0 ? ` · +${extraItems}` : ''}
                    </div>
                  </div>
                  <div className="truncate text-base text-muted-foreground">{quote.attendantEmail || 'Atendente removido'}</div>
                  <div className="text-left lg:text-right">
                    <div className="font-code text-xl font-bold tabular-nums">{money(quote.netTotal)}</div>
                    {quote.discountPercentage > 0 && <div className="text-sm text-muted-foreground">com {quote.discountPercentage}% de desconto</div>}
                  </div>
                  <div className="flex items-center gap-1 lg:justify-end">
                    <Button type="button" variant="outline" onClick={() => handleRestore(quote)}>Retomar</Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => void handleDelete(quote.id)} aria-label="Excluir orçamento" className="hover:text-destructive">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-border bg-muted px-4 py-3">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-left text-base">
                        <thead>
                          <tr className="text-sm font-semibold text-muted-foreground">
                            <th className="pb-1.5 pr-3 font-semibold">Qtd.</th>
                            <th className="pb-1.5 pr-3 font-semibold">Código</th>
                            <th className="pb-1.5 pr-3 font-semibold">Descrição</th>
                            <th className="pb-1.5 pr-3 text-right font-semibold">Unitário</th>
                            <th className="pb-1.5 text-right font-semibold">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quote.items.map((item, index) => {
                            const code = item.effectiveCode || item.partNumber;
                            return (
                              <tr key={`${quote.id}-${index}`} className="border-t border-border">
                                <td className="py-2 pr-3 font-semibold tabular-nums">{item.quantity}x</td>
                                <td className="py-2 pr-3">
                                  {item.isService ? '—' : (
                                    <span className="inline-flex items-center gap-1">
                                      <span translate="no" className="font-code text-lg font-semibold tabular-nums">
                                        {item.manufacturer?.toLowerCase().includes('husqvarna') ? formatHusqvarnaPartNumber(code) : code}
                                      </span>
                                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => copyCode(code)} aria-label={`Copiar o código ${code}`} title="Copiar o código sem espaços nem hífen">
                                        <Copy className="size-4" />
                                      </Button>
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 pr-3">{item.name}</td>
                                <td className="py-2 pr-3 text-right font-code tabular-nums">{item.unitPrice ? money(item.unitPrice) : '—'}</td>
                                <td className="py-2 text-right font-code font-bold tabular-nums">{item.unitPrice ? money(item.quantity * item.unitPrice) : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {quote.paymentMethod && (
                      <p className="mt-2 text-base text-muted-foreground">Condição: <strong className="font-semibold text-foreground">{quote.paymentMethod}</strong></p>
                    )}
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <div className="px-5 py-14 text-center">
            <p className="text-xl font-semibold">{hasFilters ? 'Nenhum orçamento encontrado' : 'Nenhum orçamento arquivado'}</p>
            <p className="mt-1 text-base text-muted-foreground">
              {hasFilters ? 'Ajuste o cliente, o telefone, o código, o modelo ou o período.' : 'Os orçamentos enviados aparecem aqui.'}
            </p>
          </div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>Anteriores</Button>
          <span className="text-base text-muted-foreground tabular-nums">Página {page + 1} de {lastPage + 1}</span>
          <Button type="button" variant="outline" disabled={page >= lastPage} onClick={() => setPage(value => Math.min(lastPage, value + 1))}>Próximos</Button>
        </div>
      )}
    </section>
  );
}
