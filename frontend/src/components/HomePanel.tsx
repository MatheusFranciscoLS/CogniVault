import { useState, useEffect } from 'react';
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

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="cv-empty">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-400" aria-hidden="true">⌕</div>
      <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div>
    </div>
  );
}

const FAST_MODELS = [
  {
    model: '143RII',
    name: 'Roçadeira 143R-II',
    tag: 'Mais Vendida',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    chips: [
      { label: 'Carburador', q: 'carburador 143RII' },
      { label: 'Filtro de ar', q: 'filtro de ar 143RII' },
      { label: 'Corda arranque', q: 'arranque 143RII' },
      { label: 'Cabeçote T35', q: 'cabecote t35 143RII' },
      { label: 'Embreagem', q: 'embreagem 143RII' },
    ],
  },
  {
    model: '120 Mark II',
    name: 'Motosserra 120 Mark II',
    tag: 'Alta Demanda',
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    chips: [
      { label: 'Sabre 16"', q: 'sabre 120 mark' },
      { label: 'Corrente', q: 'corrente 120 mark' },
      { label: 'Vela de ignição', q: 'vela 120 mark' },
      { label: 'Filtro comb.', q: 'filtro combustivel 120 mark' },
      { label: 'Bomba óleo', q: 'bomba oleo 120 mark' },
    ],
  },
  {
    model: 'Z248F',
    name: 'Giro Zero Z248F / FR691V',
    tag: 'Giro Zero',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    chips: [
      { label: 'Lâminas do deck', q: 'lamina Z248F' },
      { label: 'Correia do deck', q: 'correia deck Z248F' },
      { label: 'Filtro óleo motor', q: 'filtro de oleo Z248F' },
      { label: 'Filtro de ar motor', q: 'filtro de ar Z248F' },
      { label: 'Velas motor', q: 'vela Z248F' },
    ],
  },
  {
    model: '272XP',
    name: 'Motosserra 272XP / 61',
    tag: 'Clássica',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    chips: [
      { label: 'Pistão / Anel', q: 'pistao 272xp' },
      { label: 'Carburador', q: 'carburador 272xp' },
      { label: 'Cilindro', q: 'cilindro 272xp' },
      { label: 'Mola de partida', q: 'mola partida 272xp' },
    ],
  },
  {
    model: '345FR',
    name: 'Roçadeira 345FR',
    tag: 'Florestal',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    chips: [
      { label: 'Lâmina 3 Pontas', q: 'lamina 345fr' },
      { label: 'Carretel T45X', q: 't45x 345fr' },
      { label: 'Amortecedor', q: 'amortecedor 345fr' },
      { label: 'Eixo flexível', q: 'eixo 345fr' },
    ],
  },
  {
    model: 'FX921V',
    name: 'Giro Zero Z560X / FX921V',
    tag: 'Kawasaki Pro',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    chips: [
      { label: 'Filtro óleo FX921', q: 'filtro oleo fx921' },
      { label: 'Filtro ar FX921', q: 'filtro ar fx921' },
      { label: 'Vela de ignição', q: 'vela fx921' },
      { label: 'Virabrequim', q: 'virabrequim fx921' },
      { label: 'Lâmina 60"', q: 'lamina z560x' },
      { label: 'Correia deck', q: 'correia deck z560x' },
    ],
  },
  {
    model: '125B',
    name: 'Soprador 125B',
    tag: 'Jardim',
    badgeClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
    chips: [
      { label: 'Voluta (Caracol)', q: 'voluta 125b' },
      { label: 'Bomba purga', q: 'purga 125b' },
      { label: 'Tubo soprador', q: 'tubo 125b' },
      { label: 'Rotor ventoinha', q: 'rotor 125b' },
    ],
  },
];

export default function HomePanel({ onSearch, onCatalogs }: { onSearch: (query: string) => void; onCatalogs: (filter?: string) => void }) {
  const [query, setQuery] = useState('');
  const quoteCart = useQuoteCart();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !isTextEditingTarget(e.target)) {
        e.preventDefault();
        const input = document.getElementById('home-search');
        if (input instanceof HTMLInputElement) {
          input.focus();
          input.select();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['home'],
    queryFn: () => apiJson<{ home: HomeData }>('/api/home').then(res => res.home),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  const quickExamples = [
    'carburador 143RII',
    'sabre 120 mark',
    'filtro oleo FX921',
    '587 10 67-01',
    'virabrequim FR691V',
    'correia Z248F',
  ];

  const formatCount = (value: number | undefined) => value === undefined ? '—' : new Intl.NumberFormat('pt-BR').format(value);

  return (
    <section className="space-y-6">
      {/* Hero Principal: Busca Rápida de Peças (Google-style) */}
      <div className="relative overflow-hidden rounded-[30px] bg-white dark:bg-slate-900 px-6 py-16 sm:py-24 text-center shadow-[0_22px_70px_rgba(15,35,72,.06)] dark:shadow-none border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center">
        <div className="pointer-events-none absolute inset-0 opacity-[.03] dark:opacity-[.02] [background-image:linear-gradient(rgba(0,0,0,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,.8)_1px,transparent_1px)] dark:[background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:64px_64px]" />
        
        <div className="relative z-10 w-full max-w-3xl mx-auto flex flex-col items-center">
          <div className="mb-6 flex flex-col items-center">
             <img src="/vardao-logo-transparent.png" alt="Vardão Máquinas" className="h-auto w-[220px] dark:brightness-0 dark:invert opacity-90" />
             <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1">
               <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
               <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                 B2B Husqvarna & Peças
               </span>
             </div>
          </div>
          
          <h1 className="sr-only">Busca Global de Peças</h1>

          <form onSubmit={submit} className="w-full mt-2 relative group">
            <label htmlFor="home-search" className="sr-only">Pesquisar peça, código ou modelo</label>
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#1d4f91] dark:group-focus-within:text-blue-400 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-6 w-6"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
            </div>
            <input
              id="home-search"
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar código da peça, nome, PNC ou modelo..."
              className="w-full rounded-[24px] border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 px-14 py-4 md:py-5 text-lg md:text-xl text-slate-900 dark:text-slate-100 outline-none font-medium placeholder:text-slate-400 transition hover:shadow-lg focus:border-[#1d4f91] dark:focus:border-blue-500 focus:shadow-xl focus:shadow-blue-900/10 dark:focus:shadow-blue-900/20"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute inset-y-0 right-4 flex items-center px-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                ✕
              </button>
            ) : null}
            <button type="submit" className="sr-only">
              Pesquisar
            </button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={submit} className="rounded-full bg-slate-100 dark:bg-slate-800 px-6 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700">
              Pesquisa Inteligente
            </button>
            <button type="button" onClick={() => onCatalogs()} className="rounded-full bg-slate-100 dark:bg-slate-800 px-6 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700">
              Explorar Catálogos
            </button>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-2 text-[11px] text-slate-400">
            <span className="font-semibold text-slate-500 dark:text-slate-400 mr-1">Consultas rápidas:</span>
            {quickExamples.map(example => (
              <button
                type="button"
                key={example}
                onClick={() => onSearch(example)}
                className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1 font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Barra de Ações e Métricas Chave */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="cv-stat">
          <div className="flex items-center justify-between">
            <div className="cv-stat-label">Peças Cadastradas</div>
            <span className="cv-stat-icon" aria-hidden="true">⚙️</span>
          </div>
          <div className="cv-stat-value">
            {isLoading ? <span className="inline-block h-8 w-20 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" /> : formatCount(data?.counts.parts)}
          </div>
          <div className="cv-stat-caption">Códigos oficiais indexados na base</div>
        </div>

        <div className="cv-stat">
          <div className="flex items-center justify-between">
            <div className="cv-stat-label">Catálogos de Fábrica</div>
            <span className="cv-stat-icon" aria-hidden="true">📖</span>
          </div>
          <div className="cv-stat-value">
            {isLoading ? <span className="inline-block h-8 w-16 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" /> : formatCount(data?.counts.documents)}
          </div>
          <div className="cv-stat-caption">Manuais com diagramas e vistas explodidas</div>
        </div>

        <button type="button" onClick={() => onCatalogs()} className="cv-quick-action">
          <span className="cv-stat-icon" aria-hidden="true">🗂️</span>
          <span>
            <strong>Ver Todos os Catálogos</strong>
            <small>Consulte diagramas e PDFs de fábrica</small>
          </span>
          <span aria-hidden="true" className="ml-auto text-lg text-slate-300">→</span>
        </button>

        {quoteCart.totalItems > 0 ? (
          <button
            type="button"
            onClick={() => quoteCart.setIsOpen(true)}
            className="cv-quick-action border-amber-300 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-950/40"
          >
            <span className="cv-stat-icon text-amber-600 dark:text-amber-400 font-bold" aria-hidden="true">🛒</span>
            <span>
              <strong className="text-amber-900 dark:text-amber-200">Orçamento ativo ({quoteCart.totalItems} {quoteCart.totalItems === 1 ? 'peça' : 'peças'})</strong>
              <small className="text-amber-700 dark:text-amber-400">Ver itens e exportar WhatsApp</small>
            </span>
            <span aria-hidden="true" className="ml-auto text-lg text-amber-600">→</span>
          </button>
        ) : (
          <button type="button" onClick={() => onSearch('143RII')} className="cv-quick-action">
            <span className="cv-stat-icon" aria-hidden="true">⚡</span>
            <span>
              <strong>Consulta por Modelo</strong>
              <small>Filtre componentes por máquina</small>
            </span>
            <span aria-hidden="true" className="ml-auto text-lg text-slate-300">→</span>
          </button>
        )}
      </div>

      {/* Acesso Rápido aos Modelos Mais Vendidos (Curva A de Balcão) */}
      <div className="cv-surface rounded-[24px] p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">⭐</span>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Peças Frequentes por Máquina (Curva A)</h2>
              <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Atalho de Balcão
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Clique direto na peça ou no modelo para abrir a busca com o catálogo correspondente:
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
          {FAST_MODELS.map(card => (
            <div
              key={card.model}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-800/50 p-3.5 shadow-sm transition hover:border-blue-400 dark:hover:border-blue-600"
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate">{card.name}</span>
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${card.badgeClass}`}>
                    {card.tag}
                  </span>
                </div>
                
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {card.chips.map(chip => (
                    <button
                      type="button"
                      key={chip.q}
                      onClick={() => onSearch(chip.q)}
                      className="rounded-lg bg-slate-100 dark:bg-slate-700/70 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-[#123867] hover:text-[#1d4f91] dark:hover:text-blue-300 transition"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSearch(card.model)}
                className="mt-4 text-[11px] font-bold text-[#1d4f91] dark:text-blue-400 hover:underline text-left flex items-center gap-1 pt-2 border-t border-slate-100 dark:border-slate-700/60"
              >
                <span>Ver todas de {card.model}</span>
                <span>→</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Recentes & Favoritos: Trabalho Diário da Oficina */}
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="cv-surface rounded-[22px] p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-900 dark:text-slate-100">Pesquisas Recentes</div>
              <div className="mt-0.5 text-xs text-slate-400">Clique para retomar consultas de balcão.</div>
            </div>
            <span className="cv-soft-badge">Histórico</span>
          </div>
          
          <div className="mt-4 grid gap-2">
            {isLoading ? (
              <div className="grid gap-2">
                <div className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
                <div className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
              </div>
            ) : data?.recentSearches.length ? (
              data.recentSearches.map(item => (
                <button
                  key={item.id}
                  onClick={() => onSearch(item.resultCode || item.query)}
                  className="cv-list-row group"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-[#1d4f91] dark:group-hover:text-blue-400 transition">
                      {item.query}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {item.resultCode ? `${item.resultCode} · ${item.resultModel || ''}` : item.status.replaceAll('_', ' ')}
                    </div>
                  </div>
                  <span aria-hidden="true" className="text-slate-300 group-hover:text-blue-500 transition">→</span>
                </button>
              ))
            ) : (
              <Empty title="Sem pesquisas recentes" description="As peças consultadas aparecerão aqui para acesso em 1 clique." />
            )}
          </div>
        </div>

        <div className="cv-surface rounded-[22px] p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-900 dark:text-slate-100">Peças & Itens Favoritos</div>
              <div className="mt-0.5 text-xs text-slate-400">Códigos fixados com estrela no balcão.</div>
            </div>
            <span className="cv-soft-badge">★ Favoritos</span>
          </div>
          
          <div className="mt-4 grid gap-2">
            {isLoading ? (
              <div className="grid gap-2">
                <div className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
                <div className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
              </div>
            ) : data?.favorites.length ? (
              data.favorites.map(item => (
                <button
                  key={item.id}
                  onClick={() => item.reference ? onSearch(item.reference) : onCatalogs()}
                  className="cv-list-row group"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-[#1d4f91] dark:group-hover:text-blue-400 transition">
                      {item.label}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{item.reference || item.model || 'Catálogo salvo'}</div>
                  </div>
                  <span aria-hidden="true" className="text-amber-400 font-bold">★</span>
                </button>
              ))
            ) : (
              <Empty title="Nenhum favorito salvo" description="Marque peças frequentes com estrela para encontrá-las instantaneamente." />
            )}
          </div>
        </div>
      </div>

      {/* Catálogos Técnicos Disponíveis */}
      <div className="cv-surface rounded-[22px] p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold text-slate-900 dark:text-slate-100">Catálogos Técnicos Ativos</div>
            <div className="mt-0.5 text-xs text-slate-400">Últimos catálogos e vistas explodidas indexados na base.</div>
          </div>
          <button type="button" onClick={() => onCatalogs()} className="cv-link font-semibold text-xs">
            Ver todos os catálogos →
          </button>
        </div>

        {isLoading ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data?.recentDocuments.map(document => {
              const displayTitle = formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename) || document.model || document.filename;
              return (
                <button
                  type="button"
                  onClick={() => onCatalogs(displayTitle)}
                  key={document.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-md group"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded-lg bg-blue-50 dark:bg-[#123867] px-2 py-0.5 text-[10px] font-bold text-[#1d4f91] dark:text-blue-300">
                      {document.manufacturer || 'Husqvarna'}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {formatCount(document.partCount)} peças
                    </span>
                  </div>
                  <div className="truncate text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-[#1d4f91] dark:group-hover:text-blue-400 transition" title={displayTitle}>
                    {displayTitle}
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-400" title={document.filename}>
                    {document.filename}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {data && !data.recentDocuments.length && !isLoading && (
          <div className="mt-4">
            <Empty title="Nenhum catálogo recente" description="Envie catálogos PDF para indexar as peças da oficina." />
          </div>
        )}
      </div>
    </section>
  );
}
