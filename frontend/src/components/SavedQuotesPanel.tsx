import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useQuoteCart } from '../context/QuoteCartContext';
import type { SavedQuote } from '../context/QuoteCartContext';
import { apiJson, formatHusqvarnaPartNumber } from '../lib';
import { Icon } from './icons/Icon';

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
      id: `${item.partNumber}|${item.model || ''}|${item.pnc || ''}`,
      partNumber: item.partNumber,
      effectiveCode: item.effectiveCode ?? undefined,
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

export default function SavedQuotesPanel() {
  const { restoreQuote, deleteSavedQuote, refreshSavedQuotes } = useQuoteCart();

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
  const applyFilter = () => {
    setLoading(true);
    setPage(0);
    setAppliedFilter(filter.trim());
  };

  const clearFilters = () => {
    setLoading(true);
    setFilter('');
    setAppliedFilter('');
    setFrom('');
    setTo('');
    setPage(0);
  };

  const handleRestore = (quote: ApiQuoteListItem) => {
    if (!confirm('Retomar este orçamento substituirá os itens da cesta atual. Continuar?')) return;
    restoreQuote(toSavedQuote(quote));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este orçamento do histórico? Esta ação não pode ser desfeita.')) return;
    await deleteSavedQuote(id);
    await refreshSavedQuotes();
    reload();
    toast.success('Orçamento excluído.');
  };

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const hasFilters = Boolean(appliedFilter || from || to);

  return (
    <section className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="cv-kicker">Continuidade do atendimento</div>
          <h1 className="cv-page-title">Orçamentos</h1>
          <p className="mt-1 text-sm text-ink-500">
            Arquivados no servidor: abrem em qualquer aparelho do balcão, não só no navegador em que foram criados.
          </p>
        </div>
        <div className="text-xs font-semibold text-ink-500 tabular-nums">
          {total} {total === 1 ? 'orçamento arquivado' : 'orçamentos arquivados'}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-card border border-ink-200 bg-white p-3 shadow-card dark:border-ink-800 dark:bg-ink-850 tablet:flex-row tablet:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="quote-filter" className="block text-[10px] font-bold uppercase tracking-[.08em] text-ink-500">
            Cliente, telefone, código ou modelo
          </label>
          <div className="relative mt-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <input
              id="quote-filter"
              value={filter}
              onChange={event => setFilter(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') applyFilter(); }}
              placeholder="Ex.: Sr. Carlos, 143RII ou 5450361-01"
              className="cv-field h-11 py-0 pl-10 text-sm font-medium"
            />
          </div>
        </div>
        <div>
          <label htmlFor="quote-from" className="block text-[10px] font-bold uppercase tracking-[.08em] text-ink-500">De</label>
          <input id="quote-from" type="date" value={from} onChange={e => { setPage(0); setFrom(e.target.value); }} className="cv-field mt-1 h-11 w-full py-0 text-sm tabular-nums tablet:w-[9.5rem]" />
        </div>
        <div>
          <label htmlFor="quote-to" className="block text-[10px] font-bold uppercase tracking-[.08em] text-ink-500">Até</label>
          <input id="quote-to" type="date" value={to} onChange={e => { setPage(0); setTo(e.target.value); }} className="cv-field mt-1 h-11 w-full py-0 text-sm tabular-nums tablet:w-[9.5rem]" />
        </div>
        <button type="button" onClick={applyFilter} className="cv-brand-button cv-touch-target px-4 text-sm">Buscar</button>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="cv-secondary cv-touch-target px-4 text-sm">Limpar</button>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-card border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-850">
        <div className="hidden grid-cols-[minmax(180px,1fr)_140px_minmax(180px,1fr)_150px_120px_140px] gap-4 border-b border-ink-200 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[.1em] text-ink-500 dark:border-ink-800 lg:grid">
          <span>Cliente</span><span>Data</span><span>Conteúdo</span><span>Atendente</span><span>Total</span><span className="text-right">Ações</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 px-5 py-14 text-xs text-ink-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
            Carregando orçamentos…
          </div>
        ) : quotes.length ? (
          quotes.map(quote => {
            const reference = quote.savedAt || quote.createdAt;
            const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(reference));
            const firstItem = quote.items[0];
            const extraItems = Math.max(0, quote.items.length - 1);
            const expanded = expandedId === quote.id;

            return (
              <article key={quote.id} className="border-b border-ink-200 last:border-0 dark:border-ink-800">
                <div className="grid gap-3 px-4 py-3.5 transition hover:bg-brand-50/60 dark:hover:bg-ink-900/60 lg:grid-cols-[minmax(180px,1fr)_140px_minmax(180px,1fr)_150px_120px_140px] lg:items-center">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink-900 dark:text-white">{quote.customerName || 'Cliente não informado'}</div>
                    <div className="mt-0.5 truncate text-[11px] text-ink-500">{quote.customerPhone || 'Sem telefone'}</div>
                  </div>
                  <div className="text-xs font-semibold text-ink-500 tabular-nums">{date}</div>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : quote.id)}
                      className="flex items-center gap-1 text-left text-xs font-bold text-brand-600 hover:underline dark:text-brand-300"
                    >
                      <Icon name="chevron" className={`h-3 w-3 transition ${expanded ? 'rotate-90' : ''}`} />
                      <span className="truncate">{firstItem ? firstItem.name : 'Sem itens'}</span>
                    </button>
                    <div className="mt-0.5 text-[11px] text-ink-500 tabular-nums">
                      {quote.totalItems} {quote.totalItems === 1 ? 'item' : 'itens'}
                      {quote.machineModel ? ` · ${quote.machineModel}` : firstItem?.model ? ` · ${firstItem.model}` : ''}
                      {extraItems > 0 ? ` · +${extraItems}` : ''}
                    </div>
                  </div>
                  <div className="truncate text-[11px] font-semibold text-ink-500">{quote.attendantEmail || 'Atendente removido'}</div>
                  <div className="font-mono text-sm font-bold text-brand-600 tabular-nums dark:text-brand-300">
                    {money(quote.netTotal)}
                    {quote.discountPercentage > 0 && (
                      <span className="ml-1 block text-[10px] font-semibold text-accent-700 dark:text-accent-300">-{quote.discountPercentage}%</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 lg:justify-end">
                    <button type="button" onClick={() => handleRestore(quote)} className="cv-brand-button cv-touch-target px-3 text-xs">Retomar</button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(quote.id)}
                      aria-label="Excluir orçamento"
                      className="cv-touch-target grid place-items-center rounded-card px-2 text-ink-500 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-ink-200 bg-ink-100 px-4 py-3 dark:border-ink-800 dark:bg-ink-900">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-left text-xs">
                        <thead>
                          <tr className="text-[10px] font-bold uppercase tracking-[.08em] text-ink-500">
                            <th className="pb-1.5 pr-3">Qtd.</th>
                            <th className="pb-1.5 pr-3">Código</th>
                            <th className="pb-1.5 pr-3">Descrição</th>
                            <th className="pb-1.5 pr-3 text-right">Unit.</th>
                            <th className="pb-1.5 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quote.items.map((item, index) => (
                            <tr key={`${quote.id}-${index}`} className="border-t border-ink-200 dark:border-ink-800">
                              <td className="py-1.5 pr-3 font-bold tabular-nums">{item.quantity}x</td>
                              <td className="py-1.5 pr-3 font-mono font-semibold text-brand-600 dark:text-brand-300">
                                {item.isService ? '—' : formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber)}
                              </td>
                              <td className="py-1.5 pr-3 text-ink-700 dark:text-ink-300">{item.name}</td>
                              <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{item.unitPrice ? money(item.unitPrice) : '—'}</td>
                              <td className="py-1.5 text-right font-mono font-bold tabular-nums">
                                {item.unitPrice ? money(item.quantity * item.unitPrice) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {quote.paymentMethod && (
                      <div className="mt-2 text-[11px] text-ink-500">Condição: <strong className="font-semibold text-ink-700 dark:text-ink-300">{quote.paymentMethod}</strong></div>
                    )}
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <div className="px-5 py-12 text-center">
            <div className="text-sm font-bold text-ink-700 dark:text-ink-300">
              {hasFilters ? 'Nenhum orçamento encontrado' : 'Nenhum orçamento arquivado'}
            </div>
            <p className="mt-1 text-xs text-ink-500">
              {hasFilters
                ? 'Ajuste o cliente, telefone, código, modelo ou o período.'
                : 'Ao enviar no WhatsApp ou gerar o PDF durante o atendimento, o orçamento é arquivado aqui.'}
            </p>
          </div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage(value => Math.max(0, value - 1))}
            className="cv-secondary cv-touch-target px-4 disabled:opacity-40"
          >
            Anteriores
          </button>
          <span className="font-semibold text-ink-500 tabular-nums">Página {page + 1} de {lastPage + 1}</span>
          <button
            type="button"
            disabled={page >= lastPage}
            onClick={() => setPage(value => Math.min(lastPage, value + 1))}
            className="cv-secondary cv-touch-target px-4 disabled:opacity-40"
          >
            Próximos
          </button>
        </div>
      )}
    </section>
  );
}
