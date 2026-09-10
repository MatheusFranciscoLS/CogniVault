import { useState, useMemo } from 'react';
import { useQuoteCart } from '../context/QuoteCartContext';
import { toast } from 'sonner';

export default function SavedQuotesPanel() {
  const { savedQuotes, restoreQuote, deleteSavedQuote, clearSavedQuotes } = useQuoteCart();
  const [filter, setFilter] = useState('');

  const normalizedFilter = filter.trim().toLowerCase();
  const filteredQuotes = useMemo(() => {
    return savedQuotes.filter(quote => {
      if (!normalizedFilter) return true;
      const searchStr = `${quote.customerName || ''} ${quote.customerPhone || ''} ${quote.items[0]?.model || ''}`.toLowerCase();
      return searchStr.includes(normalizedFilter);
    });
  }, [savedQuotes, normalizedFilter]);

  const handleRestore = (quote: typeof savedQuotes[0]) => {
    if (confirm('Restaurar este orçamento substituirá os itens atuais da sua cesta. Deseja continuar?')) {
      restoreQuote(quote);
      toast.success('Orçamento restaurado com sucesso!');
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir permanentemente este orçamento salvo?')) {
      deleteSavedQuote(id);
      toast.success('Orçamento excluído!');
    }
  };

  const handleClearAll = () => {
    if (confirm('Tem certeza que deseja apagar TODOS os orçamentos salvos? Esta ação não pode ser desfeita.')) {
      clearSavedQuotes();
      toast.success('Todos os orçamentos foram apagados.');
    }
  };

  return (
    <section>
      <p className="cv-kicker">Histórico e CRM</p>
      <h1 className="cv-page-title">Orçamentos Salvos</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Gerencie e recupere orçamentos salvos anteriormente para facilitar o atendimento de retorno do cliente.
      </p>

      <div className="cv-surface mt-6 rounded-[22px] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="quote-filter" className="sr-only">Filtrar orçamentos</label>
          <input
            id="quote-filter"
            value={filter}
            onChange={event => setFilter(event.target.value)}
            placeholder="Filtrar por nome do cliente, telefone ou modelo"
            className="cv-field min-w-[220px] flex-1 text-sm"
          />
          {filter && (
            <button type="button" onClick={() => setFilter('')} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700">
              Limpar
            </button>
          )}
          {savedQuotes.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="rounded-xl px-3 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition ml-auto"
            >
              Apagar Tudo
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredQuotes.map(quote => {
          const dateStr = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(quote.createdAt));
          const totalValue = quote.items.reduce((acc, curr) => acc + (curr.quantity * (curr.unitPrice || 0)), 0);
          
          return (
            <article key={quote.id} className="cv-surface flex flex-col rounded-[22px] p-5 transition hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-600 hover:shadow-lg">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#1d4f91] dark:text-blue-300">
                  {dateStr}
                </div>
                <span className="text-amber-500 text-lg" aria-hidden="true">📝</span>
              </div>
              
              <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                {quote.customerName || 'Cliente não informado'}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {quote.customerPhone ? `Tel: ${quote.customerPhone}` : 'Sem telefone'}
              </div>
              
              <div className="mt-4 break-all font-mono text-xl font-bold text-[#1d4f91] dark:text-blue-300">
                R$ {totalValue.toFixed(2).replace('.', ',')}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {quote.items.length} {quote.items.length === 1 ? 'item' : 'itens'} · {quote.items[0]?.model || 'Diversos'}
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                <button
                  type="button"
                  onClick={() => handleRestore(quote)}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-[#1d4f91] hover:from-blue-500 hover:to-blue-700 text-white px-4 py-2 text-xs font-bold shadow-sm transition active:scale-95 flex-1 justify-center"
                >
                  <span>🔄</span>
                  <span>Restaurar Cesta</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(quote.id)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-rose-500 transition hover:border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                >
                  Apagar
                </button>
              </div>
            </article>
          );
        })}
        
        {!filteredQuotes.length && (
          <div className="col-span-full p-8 text-center bg-white dark:bg-slate-800 rounded-[22px] border border-slate-200 dark:border-slate-700">
            <div className="text-4xl mb-3">📁</div>
            <div className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              {savedQuotes.length ? 'Nenhum orçamento encontrado no filtro' : 'Nenhum orçamento salvo'}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {savedQuotes.length ? 'Tente buscar por outro nome ou telefone.' : 'Clique em "Salvar Cesta" no painel de Orçamento para guardar para depois.'}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
