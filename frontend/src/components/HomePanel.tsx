import { useQuery } from '@tanstack/react-query';
import { apiJson, formatEngineOrCatalogModel } from '../lib';
import type { HomeData } from '../types';
import { useQuoteCart } from '../context/QuoteCartContext';

function focusGlobalSearch() {
  const input = document.getElementById('cv-workspace-search');
  if (input instanceof HTMLInputElement) {
    input.focus();
    input.select();
  }
}

export default function HomePanel({ onCatalogs }: { onCatalogs: (filter?: string) => void }) {
  const quoteCart = useQuoteCart();
  const { data, isLoading } = useQuery({
    queryKey: ['home'],
    queryFn: () => apiJson<{ home: HomeData }>('/api/home').then(response => response.home),
  });

  const formatCount = (value: number | undefined) => value === undefined ? '—' : new Intl.NumberFormat('pt-BR').format(value);
  const hasActiveQuote = quoteCart.totalItems > 0;

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-1 px-1">
        <span className="text-[10px] font-black uppercase tracking-[.16em] text-[#1d4f91] dark:text-blue-300">Operação</span>
        <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">Atendimento</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Use a busca global para localizar a peça e mantenha o orçamento aberto durante todo o atendimento.</p>
      </div>

      <div className={`rounded-2xl border bg-white p-5 shadow-sm dark:bg-slate-900 sm:p-6 ${hasActiveQuote ? 'border-amber-200 dark:border-amber-900/70' : 'border-slate-200 dark:border-slate-800'}`}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Atendimento atual</div>
            {hasActiveQuote ? (
              <>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 dark:text-white">Orçamento com {quoteCart.totalItems} {quoteCart.totalItems === 1 ? 'item' : 'itens'}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">Continue pesquisando peças. Os itens permanecem no orçamento enquanto você navega pelo sistema.</p>
              </>
            ) : (
              <>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 dark:text-white">Nenhum atendimento em andamento</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">Comece digitando um código, descrição, modelo ou PNC na busca do topo.</p>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={hasActiveQuote ? () => quoteCart.setIsOpen(true) : focusGlobalSearch}
            className="h-11 shrink-0 rounded-lg bg-[#123867] px-5 text-sm font-bold text-white transition hover:bg-[#0d2c52] focus:outline-none focus:ring-4 focus:ring-blue-500/20"
          >
            {hasActiveQuote ? 'Continuar atendimento' : 'Iniciar atendimento'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Catálogos recentes</h2>
            <p className="mt-1 text-xs text-slate-400">Acesse a documentação técnica somente quando precisar confirmar aplicação ou posição.</p>
          </div>
          <button type="button" onClick={() => onCatalogs()} className="shrink-0 text-xs font-bold text-[#1d4f91] hover:underline dark:text-blue-300">Todos os catálogos →</button>
        </div>

        {isLoading ? (
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          </div>
        ) : data?.recentDocuments.length ? (
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {data.recentDocuments.slice(0, 3).map(document => {
              const title = formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename) || document.model || document.filename;
              return (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => onCatalogs(title)}
                  className="rounded-xl border border-slate-200 px-4 py-3.5 text-left transition hover:border-blue-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-blue-700 dark:hover:bg-slate-800/60"
                >
                  <div className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{title}</div>
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-slate-400">
                    <span className="truncate">{document.manufacturer || 'Husqvarna'}</span>
                    <span className="shrink-0">{formatCount(document.partCount)} peças</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-7 text-center text-sm text-slate-400 dark:border-slate-700">Nenhum catálogo disponível.</div>
        )}
      </div>
    </section>
  );
}
