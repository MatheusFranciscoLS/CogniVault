import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../lib';
import type { HomeData } from '../types';

function Empty({ title, description }: { title: string; description: string }) {
  return <div className="cv-empty"><div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-400" aria-hidden="true">⌕</div><div className="text-sm font-semibold text-slate-700">{title}</div><div className="mt-1 text-xs leading-5 text-slate-400">{description}</div></div>;
}

export default function HomePanel({ onSearch, onCatalogs }: { onSearch: (query: string) => void; onCatalogs: () => void }) {
  const [query, setQuery] = useState('');

  const { data } = useQuery({
    queryKey: ['home'],
    queryFn: () => apiJson<{ home: HomeData }>('/api/home').then(res => res.home),
  });

  const submit = (event: FormEvent) => { event.preventDefault(); if (query.trim()) onSearch(query.trim()); };
  const examples = ['carburador 143RII', 'filtro de ar 143RII', 'vela 143RII'];
  const formatCount = (value: number | undefined) => value === undefined ? '—' : new Intl.NumberFormat('pt-BR').format(value);

  return <section>
    <div className="relative overflow-hidden rounded-[30px] bg-[#0b1d3a] px-6 py-8 text-white shadow-[0_22px_70px_rgba(15,35,72,.18)] md:px-9 md:py-10 lg:px-11">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_25%,rgba(45,105,178,.34),transparent_32%),radial-gradient(circle_at_78%_110%,rgba(226,174,71,.13),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[.04] [background-image:linear-gradient(rgba(255,255,255,.25)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.25)_1px,transparent_1px)] [background-size:58px_58px]" />
      <div className="relative z-10 grid items-center gap-9 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="max-w-3xl">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-200">Vardão Máquinas · Operação de balcão</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.045em] md:text-[2.65rem]">Qual peça você precisa encontrar?</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Pesquise por código, descrição, modelo ou PNC. O CogniVault entende nomes de peças em português e inglês e cruza a consulta apenas com os catálogos processados.</p>
          <form onSubmit={submit} className="mt-6 flex gap-2 rounded-2xl bg-white p-2 shadow-2xl shadow-black/10">
            <label htmlFor="home-search" className="sr-only">Pesquisar peça, modelo ou PNC</label>
            <input id="home-search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex.: carburador 143RII ou 537 29 58-02" className="min-w-0 flex-1 rounded-xl border-0 px-4 py-3 text-sm text-slate-900 outline-none" />
            <button className="cv-primary px-5 text-sm font-semibold">Pesquisar</button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-400"><span className="mr-1">Exemplos:</span>{examples.map(example => <button type="button" key={example} onClick={() => onSearch(example)} className="rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 font-medium text-slate-200 transition hover:bg-white/[.12]">{example}</button>)}<span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 font-medium text-emerald-100">Português + inglês · tolera pequenos erros</span><span className="ml-auto hidden items-center gap-1.5 text-slate-400 sm:flex"><kbd className="rounded border border-white/15 bg-white/[.06] px-1.5 py-0.5 text-[9px] text-slate-200">Ctrl K</kbd> busca rápida em qualquer tela</span></div>
        </div>
        <div className="hidden rounded-[24px] border border-white/10 bg-white/[.06] p-5 backdrop-blur-sm lg:block">
          <div className="flex items-center gap-3"><img src="/husqvarna-logo.webp" alt="Husqvarna" className="h-11 w-11 rounded-xl object-cover ring-1 ring-white/10" /><div><div className="text-xs font-semibold">Representante Husqvarna</div><div className="mt-1 text-[10px] text-slate-400">Peças e assistência técnica</div></div></div>
          <div className="mt-5 border-t border-white/10 pt-4"><div className="text-[10px] font-bold uppercase tracking-[.13em] text-amber-200">Busca orientada</div><p className="mt-2 text-xs leading-5 text-slate-300">Para maior precisão, informe também o modelo e o PNC da máquina.</p></div>
        </div>
      </div>
    </div>

    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="cv-stat"><div className="flex items-center justify-between"><div className="cv-stat-label">Peças indexadas</div><span className="cv-stat-icon" aria-hidden="true">#</span></div><div className="cv-stat-value">{formatCount(data?.counts.parts)}</div><div className="cv-stat-caption">Disponíveis para consulta</div></div>
      <div className="cv-stat"><div className="flex items-center justify-between"><div className="cv-stat-label">Catálogos ativos</div><span className="cv-stat-icon" aria-hidden="true">▤</span></div><div className="cv-stat-value">{formatCount(data?.counts.documents)}</div><div className="cv-stat-caption">Base técnica processada</div></div>
      <button type="button" onClick={() => onSearch('carburador 143RII')} className="cv-quick-action"><span className="cv-stat-icon" aria-hidden="true">⌕</span><span><strong>Pesquisar por descrição</strong><small>Encontre mesmo sem saber o código</small></span><span aria-hidden="true" className="ml-auto text-lg text-slate-300">→</span></button>
      <button type="button" onClick={onCatalogs} className="cv-quick-action"><span className="cv-stat-icon" aria-hidden="true">▱</span><span><strong>Abrir catálogos</strong><small>Consulte PDFs e aplicações</small></span><span aria-hidden="true" className="ml-auto text-lg text-slate-300">→</span></button>
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <div className="cv-surface rounded-[22px] p-5"><div className="flex items-center justify-between"><div><div className="font-semibold">Pesquisas recentes</div><div className="mt-1 text-xs text-slate-400">Continue de onde o balcão parou.</div></div><span className="cv-soft-badge">Histórico</span></div><div className="mt-4 grid gap-2">{data?.recentSearches.length ? data.recentSearches.map(item => <button key={item.id} onClick={() => onSearch(item.resultCode || item.query)} className="cv-list-row"><div><div className="text-sm font-semibold text-slate-800">{item.query}</div><div className="mt-1 text-xs text-slate-400">{item.resultCode ? `${item.resultCode} · ${item.resultModel || ''}` : item.status.replaceAll('_', ' ')}</div></div><span aria-hidden="true" className="text-slate-300">→</span></button>) : <Empty title="Sem pesquisas ainda" description="As consultas feitas pela equipe aparecerão aqui." />}</div></div>
      <div className="cv-surface rounded-[22px] p-5"><div className="flex items-center justify-between"><div><div className="font-semibold">Favoritos</div><div className="mt-1 text-xs text-slate-400">Peças e catálogos usados com frequência.</div></div><span className="cv-soft-badge">★ Salvos</span></div><div className="mt-4 grid gap-2">{data?.favorites.length ? data.favorites.map(item => <button key={item.id} onClick={() => item.reference ? onSearch(item.reference) : onCatalogs()} className="cv-list-row"><div><div className="text-sm font-semibold text-slate-800">{item.label}</div><div className="mt-1 text-xs text-slate-400">{item.reference || item.model || 'Catálogo salvo'}</div></div><span aria-hidden="true" className="text-amber-400">★</span></button>) : <Empty title="Nenhum favorito" description="Salve peças frequentes para ganhar tempo no atendimento." />}</div></div>
    </div>

    <div className="cv-surface mt-5 rounded-[22px] p-5"><div className="flex items-center justify-between"><div><div className="font-semibold">Catálogos recentes</div><div className="mt-1 text-xs text-slate-400">Últimas bases técnicas adicionadas.</div></div><button type="button" onClick={onCatalogs} className="cv-link">Ver todos →</button></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data?.recentDocuments.map(document => <button type="button" onClick={onCatalogs} key={document.id} className="rounded-2xl border border-slate-200 bg-white/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"><div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-sm font-bold text-[#1d4f91]" aria-hidden="true">PDF</div><div className="truncate text-sm font-semibold text-slate-800">{document.filename}</div><div className="mt-2 text-xs leading-5 text-slate-400">{document.manufacturer || 'Fabricante não informado'} · {document.model || 'Modelo não informado'}<br />PNC {document.pnc || 'não informado'} · {formatCount(document.partCount)} peças</div></button>)}</div>{data && !data.recentDocuments.length && <div className="mt-4"><Empty title="Nenhum catálogo recente" description="Os novos PDFs processados aparecerão aqui." /></div>}</div>
  </section>;
}
