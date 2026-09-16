import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useQuoteCart } from '../context/QuoteCartContext';

export default function SavedQuotesPanel() {
  const { savedQuotes, restoreQuote, deleteSavedQuote, clearSavedQuotes } = useQuoteCart();
  const [filter, setFilter] = useState('');

  const normalizedFilter = filter.trim().toLowerCase();
  const filteredQuotes = useMemo(() => savedQuotes.filter(quote => {
    if (!normalizedFilter) return true;
    const itemText = quote.items.map(item => `${item.partNumber} ${item.name} ${item.model || ''}`).join(' ');
    const searchText = `${quote.customerName || ''} ${quote.customerPhone || ''} ${itemText}`.toLowerCase();
    return searchText.includes(normalizedFilter);
  }), [savedQuotes, normalizedFilter]);

  const handleRestore = (quote: typeof savedQuotes[0]) => {
    if (!confirm('Restaurar este orçamento substituirá os itens atuais. Deseja continuar?')) return;
    restoreQuote(quote);
    toast.success('Orçamento restaurado.');
  };

  const handleDelete = (id: string) => {
    if (!confirm('Excluir este orçamento salvo?')) return;
    deleteSavedQuote(id);
    toast.success('Orçamento excluído.');
  };

  const handleClearAll = () => {
    if (!confirm('Apagar todos os orçamentos salvos? Esta ação não pode ser desfeita.')) return;
    clearSavedQuotes();
    toast.success('Orçamentos apagados.');
  };

  const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <section className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-300">Continuidade do atendimento</div>
          <h1 className="mt-1 text-2xl font-black tracking-[-.03em] text-slate-950 dark:text-white">Orçamentos</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Retome atendimentos anteriores sem reconstruir a cesta peça por peça.</p>
        </div>
        <div className="text-xs font-semibold text-slate-400">{savedQuotes.length} {savedQuotes.length === 1 ? 'orçamento salvo' : 'orçamentos salvos'}</div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
          <input
            id="quote-filter"
            value={filter}
            onChange={event => setFilter(event.target.value)}
            placeholder="Cliente, telefone, código ou modelo…"
            className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-[#1d4f91] focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        {filter && <button type="button" onClick={() => setFilter('')} className="h-10 rounded-lg px-3 text-xs font-bold text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Limpar</button>}
        {savedQuotes.length > 0 && <button type="button" onClick={handleClearAll} className="h-10 rounded-lg px-3 text-xs font-bold text-rose-500 transition hover:bg-rose-50 dark:hover:bg-rose-950/30">Apagar todos</button>}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="hidden grid-cols-[minmax(190px,1fr)_150px_minmax(180px,1fr)_110px_130px] gap-4 border-b border-slate-100 px-4 py-2.5 text-[10px] font-black uppercase tracking-[.1em] text-slate-400 lg:grid dark:border-slate-800">
          <span>Cliente</span><span>Data</span><span>Conteúdo</span><span>Total</span><span className="text-right">Ações</span>
        </div>

        {filteredQuotes.length ? filteredQuotes.map(quote => {
          const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(quote.createdAt));
          const total = quote.items.reduce((sum, item) => sum + item.quantity * (item.unitPrice || 0), 0);
          const firstItem = quote.items[0];
          const extraItems = Math.max(0, quote.items.length - 1);

          return (
            <article key={quote.id} className="grid gap-3 border-b border-slate-100 px-4 py-3.5 last:border-0 transition hover:bg-slate-50/80 lg:grid-cols-[minmax(190px,1fr)_150px_minmax(180px,1fr)_110px_130px] lg:items-center dark:border-slate-800 dark:hover:bg-slate-800/45">
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-slate-900 dark:text-white">{quote.customerName || 'Cliente não informado'}</div>
                <div className="mt-1 truncate text-[11px] text-slate-400">{quote.customerPhone || 'Sem telefone'}</div>
              </div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{date}</div>
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{firstItem ? `${firstItem.partNumber} · ${firstItem.name}` : 'Sem itens'}</div>
                <div className="mt-1 text-[11px] text-slate-400">{quote.items.length} {quote.items.length === 1 ? 'item' : 'itens'}{firstItem?.model ? ` · ${firstItem.model}` : ''}{extraItems > 0 ? ` · +${extraItems}` : ''}</div>
              </div>
              <div className="font-mono text-sm font-black text-[#123867] dark:text-blue-300">{money(total)}</div>
              <div className="flex items-center gap-2 lg:justify-end">
                <button type="button" onClick={() => handleRestore(quote)} className="rounded-lg bg-[#123867] px-3 py-2 text-xs font-black text-white transition hover:bg-[#0d2c52]">Retomar</button>
                <button type="button" onClick={() => handleDelete(quote.id)} className="rounded-lg px-2.5 py-2 text-xs font-bold text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">Excluir</button>
              </div>
            </article>
          );
        }) : (
          <div className="px-5 py-12 text-center">
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{savedQuotes.length ? 'Nenhum orçamento encontrado' : 'Nenhum orçamento salvo'}</div>
            <p className="mt-1 text-xs text-slate-400">{savedQuotes.length ? 'Ajuste o cliente, telefone, código ou modelo.' : 'Salve um orçamento durante o atendimento para retomá-lo depois.'}</p>
          </div>
        )}
      </div>
    </section>
  );
}
