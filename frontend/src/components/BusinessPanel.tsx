import { useEffect, useMemo, useState } from 'react';
import PageFrame from './PageFrame';
import PageTabs, { type PageTab } from './PageTabs';
import BandStat, { Spark } from './BandStat';
import { useUrlTab } from '../lib/use-url-tab';
import { daysSince, useEnginePartsWithoutPriceData, usePriceListLast, useSearchMissesData } from '../lib/admin-queries';
import { toast } from 'sonner';
import { apiJson, formatHusqvarnaPartNumber } from '../lib';
import type { BusinessBucketGranularity, BusinessInsights } from '../types';
import { Icon } from './icons/Icon';
import EnginePartsWithoutPrice from './EnginePartsWithoutPrice';
import MostQuotedRepairs from './MostQuotedRepairs';
import PriceListUpdate from './PriceListUpdate';
import SearchMisses from './SearchMisses';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Tab = 'summary' | 'demand' | 'prices';

/** A aba vai no endereço (`?aba=demanda`); a primeira é a padrão. */
const TAB_PARAM: Record<Tab, string> = { summary: 'resumo', demand: 'demanda', prices: 'lista' };

/** Anel da faixa: dias desde a última atualização da lista de preços (branco até 14 dias, amarelo depois, para chamar o olho sem alarmar). */
function PriceAgeRing({ days }: { days: number | null }) {
  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  const fill = days === null ? 0 : Math.min(1, days / 30);
  const late = days !== null && days >= 14;
  return (
    <div className="relative size-[5.25rem] shrink-0" role="img" aria-label={days === null ? 'Lista de preços sem atualização' : `Lista de preços atualizada há ${days} dias`}>
      <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
        <circle cx="42" cy="42" r={radius} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="8" />
        <circle cx="42" cy="42" r={radius} fill="none" stroke={late ? '#ffd45c' : '#ffffff'} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fill)} transform="rotate(-90 42 42)" />
      </svg>
      <b className="absolute inset-0 grid place-items-center text-xl font-extrabold tabular-nums">{days === null ? '—' : `${days} d`}</b>
    </div>
  );
}

function displayPartNumber(partNumber: string, manufacturer: string | null): string {
  return manufacturer?.toLowerCase().includes('husqvarna')
    ? formatHusqvarnaPartNumber(partNumber)
    : partNumber;
}

const PRESETS: Array<{ label: string; days: number; granularity: BusinessBucketGranularity }> = [
  { label: '7 dias', days: 7, granularity: 'day' },
  { label: '30 dias', days: 30, granularity: 'day' },
  { label: '90 dias', days: 90, granularity: 'week' },
  { label: '12 meses', days: 365, granularity: 'month' },
];

function isoDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function presetRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { from: isoDay(from), to: isoDay(to) };
}

function money(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function compactMoney(value: number): string {
  if (value >= 1000) {
    return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
}

/**
 * O `bucket` já vem truncado no fuso da loja pelo backend (ver
 * utils/store-day.ts): é hora de parede de Limeira serializada como se fosse
 * UTC. Formatar com `timeZone: 'UTC'` é o que mantém o rótulo no dia certo —
 * deixar o navegador reinterpretar no fuso dele voltaria o dia em uma unidade.
 */
function formatBucket(iso: string, granularity: BusinessBucketGranularity): string {
  const date = new Date(iso);
  if (granularity === 'month') {
    return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date);
  }
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date);
}

function relativeDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(iso));
}

/**
 * Série de orçamentos por período. Barras em CSS puro de propósito: uma
 * biblioteca de gráfico entraria como dependência nova, e o dono precisa
 * comparar volume entre dias, não fazer análise estatística.
 */
function QuoteChart({ insights }: { insights: BusinessInsights }) {
  const { buckets, range } = insights;
  const maxValue = useMemo(
    () => Math.max(1, ...buckets.map(bucket => Math.max(bucket.netTotal, 0))),
    [buckets],
  );
  const maxQuotes = useMemo(
    () => Math.max(1, ...buckets.map(bucket => bucket.quotes)),
    [buckets],
  );

  if (!buckets.length) {
    return (
      <div className="cv-empty">
        <div className="text-sm font-bold text-foreground">Nenhum orçamento salvo neste período</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Assim que o balcão arquivar um orçamento, o volume por dia aparece aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Orçamentos por período</h2>
        <span className="text-sm text-muted-foreground">Altura = valor líquido · número = quantidade de orçamentos</span>
      </div>

      {/* `max-w` por coluna: com um único dia no período, `flex-1` sozinho
          esticava a barra por toda a largura e virava um bloco azul sem
          leitura. Barras estreitas alinhadas à esquerda mantêm a comparação. */}
      <div className="mt-4 flex items-end justify-start gap-1 overflow-x-auto pb-1" style={{ minHeight: '15rem' }}>
        {buckets.map(bucket => {
          const heightPercent = Math.max(4, (bucket.netTotal / maxValue) * 100);
          const intensity = bucket.quotes / maxQuotes;
          return (
            <div key={bucket.bucket} className="flex min-w-10 max-w-18 flex-1 flex-col items-center gap-1">
              <span className="text-sm font-bold text-foreground tabular-nums">{bucket.quotes}</span>
              <div className="flex h-48 w-full items-end border-b border-border">
                <div
                  className="w-full rounded-t-[4px] bg-brand-600 transition-[height] dark:bg-brand-400"
                  style={{ height: `${heightPercent}%`, opacity: 0.45 + intensity * 0.55 }}
                  title={`${formatBucket(bucket.bucket, range.granularity)} · ${bucket.quotes} orçamento(s) · ${money(bucket.netTotal)} · ${bucket.items} itens`}
                />
              </div>
              <span className="whitespace-nowrap text-sm font-semibold text-muted-foreground tabular-nums">
                {formatBucket(bucket.bucket, range.granularity)}
              </span>
              <span className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                {bucket.netTotal > 0 ? compactMoney(bucket.netTotal) : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BusinessPanel() {
  const [activePreset, setActivePreset] = useState(1);
  const [range, setRange] = useState(() => presetRange(PRESETS[1].days));
  const [granularity, setGranularity] = useState<BusinessBucketGranularity>(PRESETS[1].granularity);
  const [insights, setInsights] = useState<BusinessInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState<'quotes' | 'price-list' | 'price-list-gaps' | null>(null);
  const [tab, setTab] = useUrlTab(TAB_PARAM);
  const priceLast = usePriceListLast();
  const misses = useSearchMissesData();
  const engines = useEnginePartsWithoutPriceData();

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ from: range.from, to: range.to, granularity });

    void apiJson<BusinessInsights>(`/api/admin/business-insights?${params.toString()}`)
      .then(data => {
        if (!active) return;
        setInsights(data);
        setError('');
        setLoading(false);
      })
      .catch(requestError => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os indicadores.');
        setLoading(false);
      });

    return () => { active = false; };
  }, [granularity, range.from, range.to]);

  const applyPreset = (index: number) => {
    const preset = PRESETS[index];
    setLoading(true);
    setActivePreset(index);
    setGranularity(preset.granularity);
    setRange(presetRange(preset.days));
  };

  const applyCustomRange = (patch: Partial<{ from: string; to: string }>) => {
    setLoading(true);
    setActivePreset(-1);
    setRange(current => ({ ...current, ...patch }));
  };

  /**
   * O download não usa `<a href>` direto porque a rota exige o cookie de sessão
   * e precisa tratar 401/403 com mensagem — um link cru abriria uma aba com
   * JSON de erro. Aqui o blob só é criado quando a resposta é boa.
   */
  const downloadCsv = async (kind: 'quotes' | 'price-list' | 'price-list-gaps') => {
    setExporting(kind);
    const path = kind === 'quotes'
      ? `/api/admin/exports/quotes.csv?from=${range.from}&to=${range.to}`
      : `/api/admin/exports/price-list.csv${kind === 'price-list-gaps' ? '?onlyWithoutPrice=true' : ''}`;

    try {
      const response = await fetch(path, { credentials: 'include' });
      if (!response.ok) {
        let message = `Não foi possível exportar (${response.status}).`;
        try {
          const body = await response.json() as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // Resposta sem JSON: mantém a mensagem genérica com o status.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `${kind}.csv`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`Arquivo ${filename} baixado.`);
    } catch (downloadError) {
      toast.error(downloadError instanceof Error ? downloadError.message : 'Falha na exportação.');
    } finally {
      setExporting(null);
    }
  };

  const summary = insights?.summary;
  const revenueDelta = summary && summary.previousNetTotal > 0
    ? ((summary.netTotal - summary.previousNetTotal) / summary.previousNetTotal) * 100
    : undefined;

  const priceDays = daysSince(priceLast.data?.at);
  const missesTotal = misses.data?.total ?? 0;
  const enginesTotal = engines.data?.total ?? 0;
  // O que precisa do dono, em ordem: cada linha leva à aba onde se resolve.
  const pending: Array<{ key: string; title: string; detail: string; tab: Tab; action: string; primary?: boolean }> = [];
  if (priceLast.data === null) pending.push({ key: 'price', title: 'Carregar a lista de preços', detail: 'Nenhuma atualização foi feita por esta tela ainda', tab: 'prices', action: 'Abrir', primary: true });
  else if (priceDays !== null && priceDays >= 14) pending.push({ key: 'price', title: 'Atualizar a lista de preços', detail: `A última foi há ${priceDays} ${priceDays === 1 ? 'dia' : 'dias'}`, tab: 'prices', action: 'Atualizar lista', primary: true });
  if (missesTotal > 0) pending.push({ key: 'misses', title: `${missesTotal} ${missesTotal === 1 ? 'busca sem resultado' : 'buscas sem resultado'}`, detail: misses.data?.items[0] ? `A mais repetida: "${misses.data.items[0].query}" (${misses.data.items[0].count}x)` : 'Esperando cadastro', tab: 'demand', action: 'Ver buscas' });
  if (enginesTotal > 0) pending.push({ key: 'engines', title: `${enginesTotal} ${enginesTotal === 1 ? 'peça de motor consultada sem preço' : 'peças de motor consultadas sem preço'}`, detail: 'Briggs, Kawasaki e Kohler abertas no balcão e fora da lista da loja', tab: 'demand', action: 'Ver peças' });
  if (summary && summary.quotesWithoutPrice > 0) pending.push({ key: 'unpriced', title: `${summary.quotesWithoutPrice} ${summary.quotesWithoutPrice === 1 ? 'orçamento saiu sem preço' : 'orçamentos saíram sem preço'}`, detail: 'Fechados só com código, sem valor para o cliente', tab: 'demand', action: 'Ver peças' });

  const tabs: PageTab<Tab>[] = [
    { id: 'summary', label: 'Resumo' },
    { id: 'demand', label: 'Demanda', badge: pending.filter(item => item.tab === 'demand').length || undefined },
    { id: 'prices', label: 'Lista de preços', badge: pending.some(item => item.key === 'price') ? 1 : undefined },
  ];

  const spark = insights?.buckets.map(bucket => bucket.netTotal) ?? [];
  const sparkQuotes = insights?.buckets.map(bucket => bucket.quotes) ?? [];
  const trend = (delta: number | undefined) => (delta === undefined || !Number.isFinite(delta) ? undefined : `${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(0)}% vs. período anterior`);
  const loadingStat = loading && !insights;

  return (
    <PageFrame
      look="band"
      crumb="Administração"
      title="Negócio"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Período" className="flex gap-1">
            {PRESETS.map((preset, index) => (
              <Button
                key={preset.label}
                type="button"
                variant="bar"
                aria-pressed={activePreset === index}
                onClick={() => applyPreset(index)}
                className={activePreset === index ? 'border-white bg-white text-[#1f2742] hover:bg-white' : undefined}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <label htmlFor="insights-from" className="sr-only">De</label>
          <input id="insights-from" type="date" value={range.from} onChange={e => applyCustomRange({ from: e.target.value })} className="h-10 w-38 rounded-md border border-white/20 bg-white/10 px-3 text-sm tabular-nums text-white outline-none [color-scheme:dark] focus-visible:ring-3 focus-visible:ring-white/40" />
          <label htmlFor="insights-to" className="sr-only">Até</label>
          <input id="insights-to" type="date" value={range.to} onChange={e => applyCustomRange({ to: e.target.value })} className="h-10 w-38 rounded-md border border-white/20 bg-white/10 px-3 text-sm tabular-nums text-white outline-none [color-scheme:dark] focus-visible:ring-3 focus-visible:ring-white/40" />
          <Button type="button" variant="bar" onClick={() => void downloadCsv('quotes')} disabled={exporting !== null}>
            <Icon name="download" className={`size-4 ${exporting === 'quotes' ? 'animate-spin' : ''}`} />
            Exportar orçamentos
          </Button>
          <Button type="button" variant="bar" onClick={() => void downloadCsv('price-list')} disabled={exporting !== null}>
            <Icon name="download" className={`size-4 ${exporting === 'price-list' ? 'animate-spin' : ''}`} />
            Lista de preços
          </Button>
        </div>
      }
      band={
        <div className="grid items-stretch gap-y-4 xl:grid-cols-[repeat(4,minmax(0,1fr))_17rem]">
          <BandStat
            label="Orçamentos"
            value={loadingStat ? '—' : String(summary?.quotes ?? 0)}
            caption={summary ? `${summary.items} ${summary.items === 1 ? 'item cotado' : 'itens cotados'}` : undefined}
            aside={<Spark values={sparkQuotes} className="text-[#8fa7e0]" />}
          />
          <BandStat
            label="Valor cotado"
            value={loadingStat ? '—' : money(summary?.netTotal ?? 0)}
            caption={trend(revenueDelta) ?? (summary && summary.discountTotal > 0 ? `${money(summary.discountTotal)} em descontos` : undefined)}
            aside={<Spark values={spark} className="text-[#8fa7e0]" />}
          />
          <BandStat
            label="Ticket médio"
            value={loadingStat ? '—' : summary && summary.quotes > 0 ? money(summary.averageTicket) : '—'}
            caption={summary && summary.quotes > 0 ? `Base de ${summary.quotes} ${summary.quotes === 1 ? 'orçamento' : 'orçamentos'}` : 'Sem orçamento no período'}
          />
          <BandStat
            label="Sem preço"
            value={loadingStat ? '—' : String(summary?.quotesWithoutPrice ?? 0)}
            caption={summary && summary.quotesWithoutPrice > 0 ? 'orçamentos fechados só com código' : <span className="rounded-full bg-[rgba(93,211,151,.18)] px-2 py-0.5 font-semibold text-[#7be3ae]">Tudo com valor</span>}
          />
          <div className="flex items-center gap-3 border-white/15 pt-1 xl:border-l xl:pl-5">
            <PriceAgeRing days={priceDays} />
            <div className="min-w-0">
              <div className="text-sm font-semibold uppercase tracking-wider text-band-muted">Lista de preços</div>
              <div className="mt-0.5 text-base font-semibold">{priceDays === null ? (priceLast.isLoading ? 'Conferindo…' : 'Ainda não atualizada') : priceDays === 0 ? 'Atualizada hoje' : `Atualizada há ${priceDays} ${priceDays === 1 ? 'dia' : 'dias'}`}</div>
              <Button type="button" size="sm" className="mt-2" onClick={() => setTab('prices')}>Atualizar</Button>
            </div>
          </div>
        </div>
      }
      tabs={<PageTabs tabs={tabs} value={tab} onChange={setTab} label="Seções do Negócio" />}
    >
      {error && (
        <div role="alert" className="rounded-card border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {error}
        </div>
      )}

      {tab === 'summary' && (
        <div role="tabpanel" id="painel-summary" aria-labelledby="tab-summary" className="space-y-4">
          {loading && !insights ? (
            <div className="flex items-center justify-center gap-3 rounded-card border border-border bg-card px-5 py-16 text-sm text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-foreground" />
              Carregando indicadores de negócio…
            </div>
          ) : insights ? (
            <div className="grid gap-4 xl:grid-cols-12">
              <div className="xl:col-span-8"><QuoteChart insights={insights} /></div>
              <section aria-label="Precisa de você" className="overflow-hidden rounded-card border border-border bg-card xl:col-span-4">
                <div className="flex items-baseline justify-between gap-2 px-4 pt-4 pb-1">
                  <h2 className="text-lg font-semibold">Precisa de você</h2>
                  {pending.length > 0 && <span className="text-sm text-muted-foreground">{pending.length}</span>}
                </div>
                {pending.length ? (
                  <ul className="px-4 pb-3">
                    {pending.map(item => (
                      <li key={item.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 border-t border-border py-3 first:border-t-0">
                        <b className="text-base">{item.title}</b>
                        <Button type="button" size="sm" variant={item.primary ? 'default' : 'outline'} className="row-span-2" onClick={() => setTab(item.tab)}>{item.action}</Button>
                        <span className="text-sm text-muted-foreground">{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nada esperando por você.</p>
                )}
              </section>
            </div>
          ) : null}

          {insights && (
            <div className="overflow-hidden rounded-card border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-lg font-semibold">Atividade por atendente</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Quem arquivou orçamento no período. Orçamento de atendente removido continua contando.</p>
              </div>
              {insights.attendants.length ? (
              <div className="overflow-x-auto">
                <Table containerClassName="rounded-none border-0 bg-transparent">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Atendente</TableHead>
                      <TableHead className="text-right">Orçamentos</TableHead>
                      <TableHead className="text-right">Itens</TableHead>
                      <TableHead className="text-right">Valor líquido</TableHead>
                      <TableHead className="text-right">Ticket médio</TableHead>
                      <TableHead className="text-right">Último</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {insights.attendants.map(attendant => (
                      <TableRow key={attendant.userId || attendant.email}>
                        <TableCell className="font-semibold text-foreground">{attendant.name || attendant.email}</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{attendant.quotes}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{attendant.items}</TableCell>
                        <TableCell className="text-right font-mono font-semibold tabular-nums">{money(attendant.netTotal)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{money(attendant.averageTicket)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{relativeDate(attendant.lastQuoteAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum atendimento arquivado no período.</div>
            )}
            </div>
          )}
        </div>
      )}

      {tab === 'demand' && (
        <div role="tabpanel" id="painel-demand" aria-labelledby="tab-demand" className="space-y-4">
          {insights && (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="overflow-hidden rounded-card border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h2 className="text-lg font-semibold">Peças mais cotadas</h2>
                <span className="text-sm text-muted-foreground">Top {insights.topParts.length}</span>
              </div>
              {insights.topParts.length ? (
                <div className="max-h-104 overflow-auto focus-visible:outline-2 focus-visible:outline-ring" tabIndex={0} role="region" aria-label="Peças mais cotadas (rolagem)">
                  <Table containerClassName="rounded-none border-0 bg-transparent">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Peça</TableHead>
                        <TableHead className="text-right">Qtd.</TableHead>
                        <TableHead className="text-right">Orçam.</TableHead>
                        <TableHead className="text-right">Preço</TableHead>
                        <TableHead className="text-right">Última</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {insights.topParts.map(part => (
                        <TableRow key={part.normalizedPartNumber}>
                          <TableCell className="max-w-[16rem]">
                            <div className="truncate font-semibold text-foreground" title={part.name}>{part.name}</div>
                            <div className="font-mono text-sm font-bold text-brand-600 dark:text-brand-300">
                              {part.manufacturer ? `${part.manufacturer} · ` : ''}{displayPartNumber(part.partNumber, part.manufacturer)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold tabular-nums">{part.quotedQuantity}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{part.quoteCount}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {part.registeredPrice !== null && part.registeredPrice > 0 ? (
                              <span className="font-mono font-semibold">{money(part.registeredPrice)}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-1.5 py-0.5 text-sm font-bold text-warn">
                                <Icon name="warning" className="h-3 w-3" /> sem preço
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{relativeDate(part.lastQuotedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  Nenhuma peça cotada no período.
                </div>
              )}
            </div>
              <div className="overflow-hidden rounded-card border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-lg font-semibold">Peças sem preço cadastrado</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Cotadas pelo balcão sem valor. {insights.priceListCoverage.masterPartsWithoutPrice} de{' '}
                    {insights.priceListCoverage.masterParts} itens da lista estão sem preço.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void downloadCsv('price-list-gaps')}
                  disabled={exporting !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-card font-semibold text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-60 min-h-10 min-w-10 flex items-center gap-1.5 px-2.5 text-sm disabled:opacity-50"
                >
                  <Icon name="download" className={`h-3.5 w-3.5 ${exporting === 'price-list-gaps' ? 'animate-spin' : ''}`} />
                  Exportar lacunas
                </button>
              </div>
              {insights.unpricedParts.length ? (
                <div className="max-h-104 overflow-y-auto focus-visible:outline-2 focus-visible:outline-ring" tabIndex={0} role="region" aria-label="Peças sem preço cadastrado (rolagem)">
                  <Table containerClassName="rounded-none border-0 bg-transparent">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Peça</TableHead>
                        <TableHead className="text-right">Pedidos</TableHead>
                        <TableHead className="text-right">Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {insights.unpricedParts.map(part => (
                        <TableRow key={part.normalizedPartNumber}>
                          <TableCell className="max-w-[18rem]">
                            <div className="truncate font-semibold text-foreground" title={part.name}>{part.name}</div>
                            <div className="font-mono text-sm font-bold text-brand-600 dark:text-brand-300">
                              {part.manufacturer ? `${part.manufacturer} · ` : ''}{displayPartNumber(part.partNumber, part.manufacturer)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold tabular-nums">
                            {part.quoteCount}
                            <span className="block text-sm font-normal text-muted-foreground">{part.quotedQuantity} un.</span>
                          </TableCell>
                          <TableCell className="text-right">
                            {part.inPriceList ? (
                              <span className="text-sm font-bold text-warn">na lista, sem preço</span>
                            ) : (
                              <span className="text-sm font-bold text-destructive">fora da lista</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  Nenhuma peça foi cotada sem preço no período.
                </div>
              )}
            </div>
            </div>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            <MostQuotedRepairs />
            <EnginePartsWithoutPrice />
          </div>
          <SearchMisses />
        </div>
      )}

      {tab === 'prices' && (
        <div role="tabpanel" id="painel-prices" aria-labelledby="tab-prices">
          <PriceListUpdate />
        </div>
      )}
    </PageFrame>
  );
}
