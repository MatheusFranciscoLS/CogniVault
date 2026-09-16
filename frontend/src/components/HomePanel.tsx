import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson, formatEngineOrCatalogModel } from '../lib';
import type { HomeData } from '../types';
import { useQuoteCart } from '../context/QuoteCartContext';

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable;
}

function EmptyState({ children }: { children: string }) {
  return <div className="py-7 text-center text-sm text-slate-400">{children}</div>;
}

export default function HomePanel({ onSearch, onCatalogs }: { onSearch: (query: string) => void; onCatalogs: (filter?: string) => void }) {
  const [query, setQuery] = useState('');
  const quoteCart = useQuoteCart();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && !isTextEditingTarget(event.target)) {
        event.preventDefault();
        document.getElementById('home-search')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['home'],
    queryFn: () => apiJson<{ home: HomeData }>('/api/home').then(response => response.home),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (value.length >= 2) onSearch(value);
  };

  const formatCount = (value: number | undefined) => value === undefined ? '—' : new Intl.NumberFormat('pt-BR').format(value);

  return (
    <section className="mx-auto max-w-7xl space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-7 sm:py-8">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#1d4f91] dark:text-blue-300">Atendimento</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">O que o cliente precisa?</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Comece pela peça, máquina, PNC ou código. O orçamento permanece disponível durante todo o atendimento.</p>
        </div>

        <form onSubmit={submit} role="search" className="mt-6 max-w-4xl">
          <label htmlFor="home-search" className="sr-only">Buscar peça</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
              <input id="home-search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex.: carburador 143RII, 587 10 67-01 ou PNC" className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#1d4f91] focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            </div>
            <button type="submit" className="h-12 rounded-xl bg-[#123867] px-6 text-sm font-bold text-white transition hover:bg-[#0d2c52] focus:outline-none focus:ring-4 focus:ring-blue-500/20">Buscar peça</button>
          </div>
          <div className="mt-3 text-xs text-slate-400"><kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-semibold dark:border-slate-700 dark:bg-slate-800">/</kbd> foca a busca</div>
        </form>
      </div>

      {quoteCart.totalItems > 0 && (
        <button type="button" onClick={() => quoteCart.setIsOpen(true)} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-left transition hover:border-amber-300 dark:border-amber-900/60 dark:bg-amber-950/20">
          <div><div className="text-xs font-bold uppercase tracking-[.12em] text-amber-700 dark:text-amber-400">Atendimento em andamento</div><div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">Orçamento atual · {quoteCart.totalItems} {quoteCart.totalItems === 1 ? 'item' : 'itens'}</div></div>
          <span className="shrink-0 text-xs font-bold text-[#1d4f91] dark:text-blue-300">Continuar →</span>
        </button>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <button type="button" onClick={() => document.getElementById('home-search')?.focus()} className="rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700">
          <div className="text-sm font-bold text-slate-900 dark:text-white">Buscar peça</div><div className="mt-1 text-xs leading-5 text-slate-500">Código, descrição, modelo ou PNC.</div>
        </button>
        <button type="button" onClick={() => onCatalogs()} className="rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700">
          <div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-900 dark:text-white">Abrir catálogo</span><span className="text-xs font-semibold text-slate-400">{isLoading ? '—' : formatCount(data?.counts.documents)}</span></div><div className="mt-1 text-xs leading-5 text-slate-500">Consulte a vista técnica quando precisar confirmar a aplicação.</div>
        </button>
        <button type="button" onClick={() => quoteCart.setIsOpen(true)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700">
          <div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-900 dark:text-white">Orçamento</span><span className="text-xs font-semibold text-slate-400">{quoteCart.totalItems} itens</span></div><div className="mt-1 text-xs leading-5 text-slate-500">Revise os itens e finalize o atendimento.</div>
        </button>
      </div>

      {data?.favorites.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-4"><div><h2 className="text-sm font-bold text-slate-900 dark:text-white">Acesso rápido</h2><p className="mt-1 text-xs text-slate-400">Itens que você decidiu manter à mão.</p></div><span className="text-xs text-slate-400">{formatCount(data?.counts.parts)} peças ativas</span></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.favorites.slice(0, 6).map(item => (
            <button key={item.id} type="button" onClick={() => item.reference ? onSearch(item.reference) : onCatalogs()} className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 px-3.5 py-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"><div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{item.label}</div><div className="mt-0.5 truncate text-xs text-slate-400">{item.reference || item.model || 'Catálogo salvo'}</div></div><span className="text-amber-400">★</span></button>
          ))}</div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4"><div><h2 className="text-sm font-bold text-slate-900 dark:text-white">Catálogos disponíveis</h2><p className="mt-1 text-xs text-slate-400">Acesse rapidamente os últimos documentos técnicos.</p></div><button type="button" onClick={() => onCatalogs()} className="shrink-0 text-xs font-bold text-[#1d4f91] hover:underline dark:text-blue-300">Ver todos</button></div>
        {isLoading ? <div className="mt-4 h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /> : data?.recentDocuments.length ? (
          <div className="mt-4 grid gap-2 md:grid-cols-3">{data.recentDocuments.slice(0, 3).map(document => {
            const title = formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename) || document.model || document.filename;
            return <button key={document.id} type="button" onClick={() => onCatalogs(title)} className="rounded-xl border border-slate-200 p-3.5 text-left transition hover:border-blue-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-blue-700 dark:hover:bg-slate-800/60"><div className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{title}</div><div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-400"><span>{document.manufacturer || 'Husqvarna'}</span><span>{formatCount(document.partCount)} peças</span></div></button>;
          })}</div>
        ) : <EmptyState>Nenhum catálogo disponível.</EmptyState>}
      </div>
    </section>
  );
}
