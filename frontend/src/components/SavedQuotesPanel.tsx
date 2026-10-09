import { useCallback, useEffect, useState } from 'react';
import { Fragment } from 'react';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dayLabel, groupByStoreDay, storeDayKey, storeTime } from '../lib/quote-days';
import { formatPhoneBr } from '../lib/quote-pdf';
import PageFrame from './PageFrame';
import { toast } from 'sonner';
import { useConfirm } from '../context/confirm';
import { useQuoteCart } from '../context/QuoteCartContext';
import { toSavedQuote, type ApiQuoteListItem } from '../lib/saved-quote-api';
import { apiJson, cleanErpCode, formatHusqvarnaPartNumber } from '../lib';
import { ChevronRight, Copy, Search, Trash2 } from 'lucide-react';
import { playCopySound } from '../lib/sound';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

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
  const [kind, setKind] = useState<'' | 'PARTS' | 'REPAIR'>('');
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
    if (kind) params.set('kind', kind);
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
  }, [appliedFilter, from, kind, page, to, reloadToken]);

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
    setKind('');
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

  const todayKey = storeDayKey(new Date());
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const hasFilters = Boolean(appliedFilter || from || to || kind);

  return (
    <PageFrame title="Orçamentos" meta={`${total} ${total === 1 ? 'orçamento arquivado' : 'orçamentos arquivados'}`}>

      <form
        onSubmit={event => { event.preventDefault(); applyFilter(); }}
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:flex-row md:items-end"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor="quote-filter" className="block text-sm font-medium text-muted-foreground">Cliente, OS, telefone, código ou modelo</label>
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
          <span id="quote-kind-label" className="block text-sm font-medium text-muted-foreground">Tipo</span>
          <div role="group" aria-labelledby="quote-kind-label" className="inline-flex overflow-hidden rounded-md border border-input">
            {([['', 'Todos'], ['PARTS', 'Peças'], ['REPAIR', 'Conserto']] as const).map(([value, label]) => (
              <button
                key={value || 'all'}
                type="button"
                aria-pressed={kind === value}
                onClick={() => { setPage(0); setKind(value); }}
                className={cn('h-10 px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/60', kind === value ? 'bg-selected font-semibold text-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
              >
                {label}
              </button>
            ))}
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

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Cliente</TableHead>
            <TableHead className="w-20">Hora</TableHead>
            <TableHead>Conteúdo</TableHead>
            <TableHead>Atendente</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="w-48"><span className="sr-only">Ações</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            [0, 1, 2].map(item => (
              <TableRow key={item} aria-hidden="true">
                <TableCell><div className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-28" /></div></TableCell>
                <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                <TableCell><Skeleton className="ml-auto h-6 w-24" /></TableCell>
                <TableCell><Skeleton className="ml-auto h-10 w-24" /></TableCell>
              </TableRow>
            ))
          ) : quotes.length ? (
            groupByStoreDay(quotes, quote => quote.savedAt || quote.createdAt).map(group => (
              <Fragment key={group.key}>
                <tr className="bg-secondary">
                  <th colSpan={6} scope="colgroup" className="px-4 py-2 text-left text-base font-semibold">
                    {dayLabel(group.key, todayKey)}
                    <span className="ml-3 font-normal text-muted-foreground tabular-nums">
                      {group.items.length} {group.items.length === 1 ? 'orçamento' : 'orçamentos'} · {money(group.items.reduce((sum, quote) => sum + quote.netTotal, 0))}
                    </span>
                  </th>
                </tr>
                {group.items.map(quote => {
                  const reference = quote.savedAt || quote.createdAt;
                  const firstItem = quote.items[0];
                  const extraItems = Math.max(0, quote.items.length - 1);
                  const expanded = expandedId === quote.id;
                  return (
                    <Fragment key={quote.id}>
                      <TableRow>
                        <TableCell className="max-w-0">
                          <div className="truncate text-base font-semibold">{quote.kind === 'REPAIR' ? `Conserto${quote.docNumber ? ` · OS ${quote.docNumber}` : ''} · ` : ''}{quote.customerName || 'Cliente não informado'}</div>
                          <div className="truncate text-sm text-muted-foreground">{formatPhoneBr(quote.customerPhone ?? undefined) || 'Sem telefone'}</div>
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{storeTime(reference)}</TableCell>
                        <TableCell className="max-w-0">
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : quote.id)}
                            aria-expanded={expanded}
                            className="flex max-w-full items-center gap-1 rounded-sm text-left text-base font-semibold outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
                          >
                            <ChevronRight className={cn('size-4 shrink-0 transition-transform', expanded && 'rotate-90')} aria-hidden="true" />
                            <span className="truncate">{firstItem ? firstItem.name : 'Sem itens'}</span>
                          </button>
                          <div className="truncate text-sm text-muted-foreground tabular-nums">
                            {quote.totalItems} {quote.totalItems === 1 ? 'item' : 'itens'}
                            {quote.machineModel ? ` · ${quote.machineModel}` : firstItem?.model ? ` · ${firstItem.model}` : ''}
                            {extraItems > 0 ? ` · +${extraItems}` : ''}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-0 truncate text-muted-foreground">{quote.attendantName || quote.attendantEmail || 'Atendente removido'}</TableCell>
                        <TableCell className="text-right">
                          <div className="font-code text-xl font-bold tabular-nums">{money(quote.netTotal)}</div>
                          {quote.discountPercentage > 0 && <div className="text-sm text-muted-foreground">com {quote.discountPercentage}% de desconto</div>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button type="button" variant="outline" onClick={() => handleRestore(quote)}>Retomar</Button>
                            <Button type="button" variant="ghost" size="icon" onClick={() => void handleDelete(quote.id)} aria-label="Excluir orçamento" className="hover:text-destructive">
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <tr className="border-t border-border bg-muted">
                          <td colSpan={6} className="px-4 py-3">
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
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))
          ) : (
            <TableEmpty colSpan={6}>
              <p className="text-xl font-semibold text-foreground">{hasFilters ? 'Nenhum orçamento encontrado' : 'Nenhum orçamento arquivado'}</p>
              <p className="mt-1">{hasFilters ? 'Ajuste o cliente, o telefone, o código, o modelo ou o período.' : 'Os orçamentos enviados aparecem aqui.'}</p>
            </TableEmpty>
          )}
        </TableBody>
      </Table>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>Anteriores</Button>
          <span className="text-base text-muted-foreground tabular-nums">Página {page + 1} de {lastPage + 1}</span>
          <Button type="button" variant="outline" disabled={page >= lastPage} onClick={() => setPage(value => Math.min(lastPage, value + 1))}>Próximos</Button>
        </div>
      )}
    </PageFrame>
  );
}
