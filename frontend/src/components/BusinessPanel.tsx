import { useEffect, useMemo, useState } from 'react';
import PageFrame from './PageFrame';
import { toast } from 'sonner';
import { apiJson, formatHusqvarnaPartNumber } from '../lib';
import type { BusinessBucketGranularity, BusinessInsights } from '../types';
import { Icon, type IconName } from './icons/Icon';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

function StatCard({
  icon,
  label,
  value,
  caption,
  trend,
}: {
  icon: IconName;
  label: string;
  value: string;
  caption?: string;
  trend?: { delta: number; suffix: string };
}) {
  return (
    <div className="cv-stat">
      <div className="flex items-start justify-between gap-2">
        <span className="cv-stat-label">{label}</span>
        <span className="cv-stat-icon"><Icon name={icon} className="h-4 w-4" /></span>
      </div>
      <div className="cv-stat-value">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {trend && Number.isFinite(trend.delta) && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-sm font-bold tabular-nums ${
              trend.delta >= 0
                ? 'bg-ok text-ok'
                : 'bg-destructive text-destructive'
            }`}
          >
            <Icon name={trend.delta >= 0 ? 'trendUp' : 'trendDown'} className="h-3 w-3" />
            {trend.delta >= 0 ? '+' : ''}{trend.delta.toFixed(0)}% {trend.suffix}
          </span>
        )}
        {caption && <span className="cv-stat-caption">{caption}</span>}
      </div>
    </div>
  );
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
        <div className="text-sm font-bold text-ink-700 dark:text-ink-300">Nenhum orçamento salvo neste período</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Assim que o balcão arquivar um orçamento, o volume por dia aparece aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Orçamentos por período</h2>
        <span className="text-sm text-muted-foreground">Altura = valor líquido · número = quantidade de orçamentos</span>
      </div>

      {/* `max-w` por coluna: com um único dia no período, `flex-1` sozinho
          esticava a barra por toda a largura e virava um bloco azul sem
          leitura. Barras estreitas alinhadas à esquerda mantêm a comparação. */}
      <div className="mt-4 flex items-end justify-start gap-1 overflow-x-auto pb-1" style={{ minHeight: '11rem' }}>
        {buckets.map(bucket => {
          const heightPercent = Math.max(4, (bucket.netTotal / maxValue) * 100);
          const intensity = bucket.quotes / maxQuotes;
          return (
            <div key={bucket.bucket} className="flex min-w-10 max-w-18 flex-1 flex-col items-center gap-1">
              <span className="text-sm font-bold text-ink-700 tabular-nums dark:text-ink-300">{bucket.quotes}</span>
              <div className="flex h-32 w-full items-end">
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
  const quotesDelta = summary && summary.previousQuotes > 0
    ? ((summary.quotes - summary.previousQuotes) / summary.previousQuotes) * 100
    : undefined;
  const revenueDelta = summary && summary.previousNetTotal > 0
    ? ((summary.netTotal - summary.previousNetTotal) / summary.previousNetTotal) * 100
    : undefined;

  return (
    <PageFrame title="Negócio">

      <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-3 shadow-card tablet:flex-row tablet:items-end tablet:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset, index) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                aria-pressed={activePreset === index}
                onClick={() => applyPreset(index)}
                className={activePreset === index ? 'border-ring bg-selected' : undefined}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="insights-from" className="block text-sm font-bold text-muted-foreground">De</label>
              <input id="insights-from" type="date" value={range.from} onChange={e => applyCustomRange({ from: e.target.value })} className="h-10 rounded-md border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/60 mt-1 h-11 w-38 py-0 text-sm tabular-nums" />
            </div>
            <div>
              <label htmlFor="insights-to" className="block text-sm font-bold text-muted-foreground">Até</label>
              <input id="insights-to" type="date" value={range.to} onChange={e => applyCustomRange({ to: e.target.value })} className="h-10 rounded-md border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/60 mt-1 h-11 w-38 py-0 text-sm tabular-nums" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void downloadCsv('quotes')} disabled={exporting !== null}>
            <Icon name="download" className={`size-4 ${exporting === 'quotes' ? 'animate-spin' : ''}`} />
            Exportar orçamentos
          </Button>
          <Button type="button" variant="outline" onClick={() => void downloadCsv('price-list')} disabled={exporting !== null}>
            <Icon name="download" className={`size-4 ${exporting === 'price-list' ? 'animate-spin' : ''}`} />
            Lista de preços
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-card border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {error}
        </div>
      )}

      {loading && !insights ? (
        <div className="flex items-center justify-center gap-3 rounded-card border border-border bg-card px-5 py-16 text-sm text-ink-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
          Carregando indicadores de negócio…
        </div>
      ) : insights && summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon="quote"
              label="Orçamentos salvos"
              value={String(summary.quotes)}
              caption={`${summary.items} ${summary.items === 1 ? 'item' : 'itens'} cotados`}
              trend={quotesDelta === undefined ? undefined : { delta: quotesDelta, suffix: 'vs. período anterior' }}
            />
            <StatCard
              icon="money"
              label="Valor líquido cotado"
              value={money(summary.netTotal)}
              caption={summary.discountTotal > 0 ? `${money(summary.discountTotal)} em descontos` : 'Sem descontos aplicados'}
              trend={revenueDelta === undefined ? undefined : { delta: revenueDelta, suffix: 'vs. período anterior' }}
            />
            <StatCard
              icon="tag"
              label="Ticket médio"
              value={summary.quotes > 0 ? money(summary.averageTicket) : '—'}
              caption={summary.quotes > 0 ? `Base de ${summary.quotes} orçamento(s)` : 'Sem orçamento no período'}
            />
            <StatCard
              icon="warning"
              label="Cotados sem preço"
              value={String(summary.quotesWithoutPrice)}
              caption={
                summary.quotesWithoutPrice > 0
                  ? 'Orçamentos fechados só com código — sem valor para o cliente'
                  : 'Todo orçamento saiu com valor'
              }
            />
          </div>

          <QuoteChart insights={insights} />

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="overflow-hidden rounded-card border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h2 className="text-lg font-semibold">Peças mais cotadas</h2>
                <span className="text-sm text-muted-foreground">Top {insights.topParts.length}</span>
              </div>
              {insights.topParts.length ? (
                <div className="overflow-x-auto">
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
                              <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-1.5 py-0.5 text-sm font-bold text-gold-800 dark:bg-gold-500/15 dark:text-gold-300">
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
                <div className="max-h-104 overflow-y-auto">
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
                              <span className="text-sm font-bold text-gold-800 dark:text-gold-300">na lista, sem preço</span>
                            ) : (
                              <span className="text-sm font-bold text-accent-700 dark:text-accent-300">fora da lista</span>
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
        </>
      ) : null}
    </PageFrame>
  );
}
