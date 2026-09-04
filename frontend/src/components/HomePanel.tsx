import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../lib';
import type { HomeData } from '../types';
import { useQuoteCart } from '../context/QuoteCartContext';
import { toast } from 'sonner';

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="cv-empty">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-400" aria-hidden="true">⌕</div>
      <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div>
    </div>
  );
}

const CURVA_A_MODELS = [
  {
    model: '143RII',
    name: 'Roçadeira 143R-II',
    tag: 'Campeã de Vendas',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    chips: [
      { label: 'Filtro de ar', q: 'filtro ar 143RII' },
      { label: 'Carburador', q: 'carburador 143RII' },
      { label: 'Corda arranque', q: 'arranque 143RII' },
      { label: 'Cabeçote T35', q: 'cabecote 143RII' },
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
      { label: 'Vela Champion', q: 'vela 120 mark' },
      { label: 'Filtro comb.', q: 'combustivel 120 mark' },
      { label: 'Bomba óleo', q: 'bomba oleo 120 mark' },
    ],
  },
  {
    model: '345FR',
    name: 'Roçadeira 345FR',
    tag: 'Florestal',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    chips: [
      { label: 'Lâmina 3P', q: 'lamina 345fr' },
      { label: 'Carretel T45X', q: 't45x 345fr' },
      { label: 'Amortecedor', q: 'amortecedor 345fr' },
      { label: 'Eixo flexível', q: 'eixo 345fr' },
    ],
  },
  {
    model: '272XP',
    name: 'Motosserra 272XP / 61',
    tag: 'Clássicas',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    chips: [
      { label: 'Pistão / Anel', q: 'pistao 272xp' },
      { label: 'Carburador', q: 'carburador 272xp' },
      { label: 'Cilindro', q: 'cilindro 272xp' },
      { label: 'Mola partida', q: 'mola 272xp' },
    ],
  },
  {
    model: '125B',
    name: 'Soprador 125B / 125BVX',
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

const JARGÕES_BALCAO = [
  { slang: 'Cordinha de puxar', tech: 'Corda / Mola de arranque', q: 'arranque corda' },
  { slang: 'Cebolinha / Pera injetora', tech: 'Bomba de purga / Primer', q: 'purga primer' },
  { slang: 'Tampa da cordinha', tech: 'Conjunto de partida montado', q: 'conjunto partida' },
  { slang: 'Caracol do soprador', tech: 'Voluta / Carcaça do rotor', q: 'voluta soprador' },
  { slang: 'Caximbo da vela', tech: 'Terminal / Coifa de vela', q: 'terminal vela' },
  { slang: 'Membrana do carburador', tech: 'Kit reparo / Diafragma', q: 'reparo carburador' },
  { slang: 'Retentor e junta', tech: 'Kit vedação de cárter', q: 'vedacao retentor' },
  { slang: 'Pinhão da corrente', tech: 'Tambor de embreagem', q: 'tambor embreagem' },
];

export default function HomePanel({ onSearch, onCatalogs }: { onSearch: (query: string) => void; onCatalogs: (filter?: string) => void }) {
  const [query, setQuery] = useState('');
  const quoteCart = useQuoteCart();
  const [fuelLiters, setFuelLiters] = useState<number>(5);
  const [fuelRatio, setFuelRatio] = useState<50 | 33 | 25>(50);
  const oilMl = Math.round((fuelLiters * 1000) / fuelRatio);

  const copyFuelInstruction = () => {
    const text = `*Recomendação de Mistura 2T Husqvarna - Vardão Máquinas*\n\n` +
      `⛽ *Gasolina:* ${fuelLiters} Litro(s) de gasolina comum limpa\n` +
      `🧴 *Óleo 2T:* Adicionar exatamente *${oilMl} ml* de Óleo 2T Husqvarna PRO (Proporção ${fuelRatio}:1)\n\n` +
      `⚠️ *Cuidados Essenciais:*\n` +
      `• Agite bem o galão antes de abastecer o tanque da máquina.\n` +
      `• Não utilize mistura parada com mais de 15 dias no galão ou tanque.\n` +
      `• Nunca use óleo de motor 4T ou óleo náutico TC-W3. Use sempre padrão JASO FD / ISO-L-EGD.`;
    void navigator.clipboard.writeText(text);
    toast.success('Instrução de mistura 2T copiada para a área de transferência!');
  };

  const { data, isLoading } = useQuery({
    queryKey: ['home'],
    queryFn: () => apiJson<{ home: HomeData }>('/api/home').then(res => res.home),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  const examples = ['carburador 143RII', 'sabre motosserra 120', 'filtro de ar 353', '587106701'];
  const formatCount = (value: number | undefined) => value === undefined ? '—' : new Intl.NumberFormat('pt-BR').format(value);

  return (
    <section className="space-y-6">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-[30px] bg-[#0b1d3a] px-6 py-8 text-white shadow-[0_22px_70px_rgba(15,35,72,.18)] md:px-9 md:py-10 lg:px-11">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_25%,rgba(45,105,178,.34),transparent_32%),radial-gradient(circle_at_78%_110%,rgba(226,174,71,.13),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[.04] [background-image:linear-gradient(rgba(255,255,255,.25)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.25)_1px,transparent_1px)] [background-size:58px_58px]" />
        <div className="relative z-10 grid items-center gap-9 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="max-w-3xl">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-200">Vardão Máquinas · Operação de Balcão & Oficina</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-.045em] md:text-[2.65rem]">Qual peça você precisa encontrar hoje?</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Pesquise por código Husqvarna, modelo, PNC ou descrição. Monte orçamentos rápidos para balcão e WhatsApp sem consultar PDFs externos.
            </p>
            <form onSubmit={submit} className="mt-6 flex items-center gap-2 rounded-2xl bg-white dark:bg-slate-800 p-2 shadow-2xl shadow-black/10">
              <label htmlFor="home-search" className="sr-only">Pesquisar peça, modelo ou PNC</label>
              <input
                id="home-search"
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Ex.: carburador 143RII ou 537 29 58-02"
                className="min-w-0 flex-1 rounded-xl border-0 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="flex items-center rounded-xl px-2.5 sm:px-3 text-xs font-semibold text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:text-slate-300"
                >
                  Limpar
                </button>
              ) : null}
              <button className="cv-primary px-5 text-sm font-semibold">Pesquisar</button>
            </form>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span className="mr-1">Exemplos:</span>
              {examples.map(example => (
                <button
                  type="button"
                  key={example}
                  onClick={() => onSearch(example)}
                  className="rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 font-medium text-slate-200 transition hover:bg-white/[.12]"
                >
                  {example}
                </button>
              ))}
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 font-medium text-emerald-100">
                Português + inglês · tolera pequenos erros
              </span>
              <span className="ml-auto hidden items-center gap-1.5 text-slate-400 sm:flex">
                <kbd className="rounded border border-white/15 bg-white/[.06] px-1.5 py-0.5 text-[9px] text-slate-200">Ctrl K</kbd> busca rápida
              </span>
            </div>
          </div>
          <div className="hidden rounded-[24px] border border-white/10 bg-white/[.06] p-5 backdrop-blur-sm lg:block">
            <div className="flex items-center gap-3">
              <img src="/husqvarna-logo.webp" alt="Husqvarna" className="h-11 w-11 rounded-xl object-cover ring-1 ring-white/10" />
              <div>
                <div className="text-xs font-semibold">Representante Husqvarna</div>
                <div className="mt-1 text-[10px] text-slate-400">Vardão Máquinas · Concessionária</div>
              </div>
            </div>
            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="text-[10px] font-bold uppercase tracking-[.13em] text-amber-200">Orçamento Ágil</div>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                Monte listas de peças durante o atendimento e exporte com 1 clique para o WhatsApp do cliente.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats & Quick Action Bar */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="cv-stat">
          <div className="flex items-center justify-between">
            <div className="cv-stat-label">Peças indexadas</div>
            <span className="cv-stat-icon" aria-hidden="true">#</span>
          </div>
          <div className="cv-stat-value">
            {isLoading ? <span className="inline-block h-8 w-20 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" /> : formatCount(data?.counts.parts)}
          </div>
          <div className="cv-stat-caption">Peças ativas na base local</div>
        </div>

        <div className="cv-stat">
          <div className="flex items-center justify-between">
            <div className="cv-stat-label">Catálogos de Fábrica</div>
            <span className="cv-stat-icon" aria-hidden="true">▤</span>
          </div>
          <div className="cv-stat-value">
            {isLoading ? <span className="inline-block h-8 w-16 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" /> : formatCount(data?.counts.documents)}
          </div>
          <div className="cv-stat-caption">Modelos processados (PDF)</div>
        </div>

        <button type="button" onClick={() => onSearch('carburador 143RII')} className="cv-quick-action">
          <span className="cv-stat-icon" aria-hidden="true">⌕</span>
          <span>
            <strong>Pesquisar por descrição</strong>
            <small>Encontre peças sem saber o código</small>
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
          <button type="button" onClick={() => onCatalogs()} className="cv-quick-action">
            <span className="cv-stat-icon" aria-hidden="true">▱</span>
            <span>
              <strong>Explorar Catálogos</strong>
              <small>Consulte diagramas e vistas explodidas</small>
            </span>
            <span aria-hidden="true" className="ml-auto text-lg text-slate-300">→</span>
          </button>
        )}
      </div>

      {/* Curva A: Peças de Alto Giro por Máquina */}
      <div className="cv-surface rounded-[24px] p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">⭐</span>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Peças de Alto Giro (Curva A de Balcão)</h2>
              <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Acesso Rápido
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Atenda os modelos mais frequentes da oficina e balcão com um único clique.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {CURVA_A_MODELS.map(card => (
            <div
              key={card.model}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-800/40 p-3.5 shadow-sm transition hover:border-blue-300 dark:hover:border-blue-700"
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate">{card.name}</span>
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${card.badgeClass}`}>
                    {card.tag}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {card.chips.map(chip => (
                    <button
                      type="button"
                      key={chip.q}
                      onClick={() => onSearch(chip.q)}
                      className="rounded-lg bg-slate-100 dark:bg-slate-700/60 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-[#123867] hover:text-[#1d4f91] dark:hover:text-blue-300 transition"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSearch(card.model)}
                className="mt-4 text-[11px] font-semibold text-[#1d4f91] dark:text-blue-400 hover:underline text-left flex items-center gap-1"
              >
                <span>Ver todas de {card.model}</span>
                <span>→</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Dicionário de Balcão e Jargões */}
      <div className="cv-surface rounded-[24px] p-6 shadow-sm border border-slate-200 dark:border-slate-800 bg-gradient-to-r from-blue-50/40 via-white to-indigo-50/30 dark:from-slate-800/40 dark:via-slate-800/20 dark:to-indigo-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🗣️</span>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Sinônimos & Jargões de Balcão</h2>
              <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Fale como o mecânico
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              O cliente pediu pelo nome popular? Clique para consultar o termo técnico correspondente na base oficial:
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {JARGÕES_BALCAO.map(item => (
            <button
              type="button"
              key={item.slang}
              onClick={() => onSearch(item.q)}
              className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-3 text-left transition hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-slate-700/60 shadow-xs group"
            >
              <div className="min-w-0 pr-2">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-[#1d4f91] dark:group-hover:text-blue-300 truncate">
                  &ldquo;{item.slang}&rdquo;
                </div>
                <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-400 truncate">
                  ➔ {item.tech}
                </div>
              </div>
              <span className="text-xs text-slate-300 group-hover:text-blue-500 transition">⌕</span>
            </button>
          ))}
        </div>
      </div>

      {/* Ferramentas de Oficina & Balcão */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Calculadora de Mistura 2T */}
        <div className="cv-surface rounded-[24px] p-6 shadow-sm border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-amber-50/40 via-white to-amber-50/10 dark:from-slate-800/60 dark:via-slate-800/40 dark:to-amber-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🧴</span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Calculadora de Mistura 2 Tempos</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Dosagem oficial recomendada Husqvarna</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-amber-500/10 dark:bg-amber-950/60 border border-amber-500/20 rounded-xl p-1">
              {([50, 33, 25] as const).map(ratio => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setFuelRatio(ratio)}
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-bold transition ${
                    fuelRatio === ratio
                      ? 'bg-amber-500 text-slate-950 shadow-2xs'
                      : 'text-amber-800 dark:text-amber-300 hover:bg-amber-500/20'
                  }`}
                >
                  {ratio}:1
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                Gasolina Comum Limpa
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0.5}
                  max={100}
                  step={0.5}
                  value={fuelLiters}
                  onChange={e => setFuelLiters(Math.max(0.1, Number(e.target.value)))}
                  className="w-24 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-amber-500/30"
                />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Litros</span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {[1, 2, 5, 10, 20].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFuelLiters(val)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition active:scale-95 ${
                      fuelLiters === val
                        ? 'bg-amber-500 text-slate-950 shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {val}L
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/20 p-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Óleo 2T Husqvarna ({fuelRatio}:1):
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-amber-600 dark:text-amber-400">{oilMl}</span>
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300">ml de óleo</span>
                </div>
                <div className="text-[10px] text-amber-700/80 dark:text-amber-300/70 mt-1">
                  {fuelRatio === 50 ? 'Padrão Husqvarna PRO (20ml / Litro)' : fuelRatio === 33 ? 'Amaciamento / 3% (30ml / Litro)' : 'Motores antigos / 4% (40ml / Litro)'}
                </div>
              </div>
              <button
                type="button"
                onClick={copyFuelInstruction}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 transition active:scale-95"
              >
                <span>📋</span>
                <span className="underline">Copiar instrução p/ WhatsApp</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tabela de Especificações da Oficina */}
        <div className="cv-surface rounded-[24px] p-6 shadow-sm border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="text-2xl">🔧</span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Guia Rápido da Oficina Husqvarna</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Folgas, torques e regulagens recomendadas</p>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 text-xs">
            <div className="rounded-xl border border-slate-100 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/60 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Folga do Eletrodo da Vela</span>
              <strong className="text-slate-800 dark:text-slate-200 text-sm">0,5 mm</strong>
              <span className="block text-[10px] text-slate-400 mt-0.5">Vela Champion RCJ7Y / NGK CMR7H</span>
            </div>

            <div className="rounded-xl border border-slate-100 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/60 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Entreferro da Bobina</span>
              <strong className="text-slate-800 dark:text-slate-200 text-sm">0,3 mm</strong>
              <span className="block text-[10px] text-slate-400 mt-0.5">Espessura de cartão de visita padrão</span>
            </div>

            <div className="rounded-xl border border-slate-100 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/60 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Marcha Lenta Padrão</span>
              <strong className="text-slate-800 dark:text-slate-200 text-sm">2.700 – 3.000 RPM</strong>
              <span className="block text-[10px] text-slate-400 mt-0.5">Sem engate da embreagem / lâmina</span>
            </div>

            <div className="rounded-xl border border-slate-100 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/60 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Ajuste H & L Carburador</span>
              <strong className="text-slate-800 dark:text-slate-200 text-sm">1 volta aberta</strong>
              <span className="block text-[10px] text-slate-400 mt-0.5">Ponto de partida do encosto suave</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recentes & Favoritos */}
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="cv-surface rounded-[22px] p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">Pesquisas recentes</div>
              <div className="mt-1 text-xs text-slate-400">Continue de onde o balcão parou.</div>
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
                  className="cv-list-row"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.query}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {item.resultCode ? `${item.resultCode} · ${item.resultModel || ''}` : item.status.replaceAll('_', ' ')}
                    </div>
                  </div>
                  <span aria-hidden="true" className="text-slate-300">→</span>
                </button>
              ))
            ) : (
              <Empty title="Sem pesquisas ainda" description="As consultas feitas pela equipe aparecerão aqui." />
            )}
          </div>
        </div>

        <div className="cv-surface rounded-[22px] p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">Favoritos salvos</div>
              <div className="mt-1 text-xs text-slate-400">Peças e catálogos marcados com estrela.</div>
            </div>
            <span className="cv-soft-badge">★ Salvos</span>
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
                  className="cv-list-row"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.label}</div>
                    <div className="mt-1 text-xs text-slate-400">{item.reference || item.model || 'Catálogo salvo'}</div>
                  </div>
                  <span aria-hidden="true" className="text-amber-400 font-bold">★</span>
                </button>
              ))
            ) : (
              <Empty title="Nenhum favorito" description="Salve peças frequentes para ganhar tempo no atendimento." />
            )}
          </div>
        </div>
      </div>

      {/* Catálogos Recentes */}
      <div className="cv-surface rounded-[22px] p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">Catálogos técnicos indexados</div>
            <div className="mt-1 text-xs text-slate-400">Últimos manuais de peças Husqvarna processados.</div>
          </div>
          <button type="button" onClick={() => onCatalogs()} className="cv-link font-semibold">Ver todos os catálogos →</button>
        </div>
        {isLoading ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data?.recentDocuments.map(document => (
              <button
                type="button"
                onClick={() => onCatalogs(document.model || document.filename)}
                key={document.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-md group"
              >
                <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-blue-50 dark:bg-[#123867] text-sm font-bold text-[#1d4f91] dark:text-blue-300 group-hover:bg-blue-600 group-hover:text-white transition" aria-hidden="true">
                  PDF
                </div>
                <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{document.filename}</div>
                <div className="mt-2 text-xs leading-5 text-slate-400">
                  {document.manufacturer || 'Husqvarna'} · {document.model || 'Modelo não informado'}<br />
                  PNC {document.pnc || '—'} · {formatCount(document.partCount)} peças
                </div>
              </button>
            ))}
          </div>
        )}
        {data && !data.recentDocuments.length && !isLoading && (
          <div className="mt-4">
            <Empty title="Nenhum catálogo recente" description="Os novos PDFs processados aparecerão aqui." />
          </div>
        )}
      </div>
    </section>
  );
}
