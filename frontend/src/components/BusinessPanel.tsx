import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiJson, formatHusqvarnaPartNumber } from '../lib';
import type { BusinessBucketGranularity, BusinessInsights } from '../types';
import { Icon, type IconName } from './icons/Icon';

const PRESETS: Array<{ label: string; days: number; granularity: BusinessBucketGranularity }> = [
  { label: '7 dias', days: 7, granularity: 'day' },
  { label: '30 dias', days: 30, granularity: 'day' },
  { label: '90 dias', days: 90, granularity: 'week' },
  { label: '12 meses', days: 365, granularity: 'month' },
];

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
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
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
              trend.delta >= 0
                ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                : 'bg-rose-500/12 text-rose-700 dark:text-rose-400'
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
        <p className="mt-1 text-xs text-ink-500">
          Assim que o balcão arquivar um orçamento, o volume por dia aparece aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-ink-200 bg-white p-4 shadow-card dark:border-ink-800 dark:bg-ink-850">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink-900 dark:text-white">Orçamentos por período</h2>
        <span className="text-[11px] text-ink-500">Altura = valor líquido · número = quantidade de orçamentos</span>
      </div>

      {/* `max-w` por coluna: com um único dia no período, `flex-1` sozinho
          esticava a barra por toda a largura e virava um bloco azul sem
          leitura. Barras estreitas alinhadas à esquerda mantêm a comparação. */}
      <div className="mt-4 flex items-end justify-start gap-1 overflow-x-auto pb-1" style={{ minHeight: '11rem' }}>
        {buckets.map(bucket => {
          const heightPercent = Math.max(4, (bucket.netTotal / maxValue) * 100);
          const intensity = bucket.quotes / maxQuotes;
          return (
            <div key={bucket.bucket} className="flex min-w-[2.5rem] max-w-[4.5rem] flex-1 flex-col items-center gap-1">
              <span className="text-[10px] font-bold text-ink-700 tabular-nums dark:text-ink-300">{bucket.quotes}</span>
              <div className="flex h-32 w-full items-end">
                <div
                  className="w-full rounded-t-[4px] bg-brand-600 transition-all dark:bg-brand-400"
                  style={{ height: `${heightPercent}%`, opacity: 0.45 + intensity * 0.55 }}
                  title={`${formatBucket(bucket.bucket, range.granularity)} · ${bucket.quotes} orçamento(s) · ${money(bucket.netTotal)} · ${bucket.items} itens`}
                />
              </div>
              <span className="whitespace-nowrap text-[10px] font-semibold text-ink-500 tabular-nums">
                {formatBucket(bucket.bucket, range.granularity)}
              </span>
              <span className="whitespace-nowrap text-[9px] text-ink-500 tabular-nums">
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
    <section className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="cv-kicker">Painel do dono</div>
          <h1 className="cv-page-title">Negócio</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            O que o balcão cotou, o que os clientes mais pedem e o que está sem preço cadastrado.
            Números de venda, não de catálogo — a saúde técnica fica em Qualidade.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-ink-200 bg-white p-3 shadow-card dark:border-ink-800 dark:bg-ink-850 tablet:flex-row tablet:items-end tablet:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset, index) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(index)}
                className={`cv-touch-target rounded-card px-3 text-xs font-bold transition ${
                  activePreset === index
                    ? 'bg-brand-600 text-white'
                    : 'border border-ink-200 bg-white text-ink-700 hover:bg-brand-50 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="insights-from" className="block text-[10px] font-bold uppercase tracking-[.08em] text-ink-500">De</label>
              <input id="insights-from" type="date" value={range.from} onChange={e => applyCustomRange({ from: e.target.value })} className="cv-field mt-1 h-11 w-[9.5rem] py-0 text-sm tabular-nums" />
            </div>
            <div>
              <label htmlFor="insights-to" className="block text-[10px] font-bold uppercase tracking-[.08em] text-ink-500">Até</label>
              <input id="insights-to" type="date" value={range.to} onChange={e => applyCustomRange({ to: e.target.value })} className="cv-field mt-1 h-11 w-[9.5rem] py-0 text-sm tabular-nums" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void downloadCsv('quotes')}
            disabled={exporting !== null}
            className="cv-primary cv-touch-target flex items-center gap-2 px-3 text-xs disabled:opacity-50"
          >
            <Icon name="download" className={`h-4 w-4 ${exporting === 'quotes' ? 'animate-spin' : ''}`} />
            Exportar orçamentos
          </button>
          <button
            type="button"
            onClick={() => void downloadCsv('price-list')}
            disabled={exporting !== null}
            className="cv-secondary cv-touch-target flex items-center gap-2 px-3 text-xs disabled:opacity-50"
          >
            <Icon name="download" className={`h-4 w-4 ${exporting === 'price-list' ? 'animate-spin' : ''}`} />
            Lista de preços
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-card border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading && !insights ? (
        <div className="flex items-center justify-center gap-3 rounded-card border border-ink-200 bg-white px-5 py-16 text-xs text-ink-500 dark:border-ink-800 dark:bg-ink-850">
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
            <div className="overflow-hidden rounded-card border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-850">
              <div className="flex items-center justify-between gap-2 border-b border-ink-200 px-4 py-3 dark:border-ink-800">
                <h2 className="text-sm font-bold text-ink-900 dark:text-white">Peças mais cotadas</h2>
                <span className="text-[11px] text-ink-500">Top {insights.topParts.length}</span>
              </div>
              {insights.topParts.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase tracking-[.08em] text-ink-500">
                        <th className="px-4 py-2">Peça</th>
                        <th className="px-2 py-2 text-right">Qtd.</th>
                        <th className="px-2 py-2 text-right">Orçam.</th>
                        <th className="px-2 py-2 text-right">Preço cadastrado</th>
                        <th className="px-4 py-2 text-right">Última</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insights.topParts.map(part => (
                        <tr key={part.normalizedPartNumber} className="border-t border-ink-200 dark:border-ink-800">
                          <td className="max-w-[16rem] px-4 py-2.5">
                            <div className="truncate font-semibold text-ink-900 dark:text-white" title={part.name}>{part.name}</div>
                            <div className="font-mono text-[11px] font-bold text-brand-600 dark:text-brand-300">
                              {formatHusqvarnaPartNumber(part.partNumber)}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-right font-bold tabular-nums">{part.quotedQuantity}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-ink-500">{part.quoteCount}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">
                            {part.registeredPrice !== null && part.registeredPrice > 0 ? (
                              <span className="font-mono font-semibold">{money(part.registeredPrice)}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-1.5 py-0.5 text-[10px] font-bold text-gold-800 dark:bg-gold-500/15 dark:text-gold-300">
                                <Icon name="warning" className="h-3 w-3" /> sem preço
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-ink-500">{relativeDate(part.lastQuotedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-10 text-center text-xs text-ink-500">
                  Nenhuma peça cotada no período.
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-card border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-850">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 px-4 py-3 dark:border-ink-800">
                <div>
                  <h2 className="text-sm font-bold text-ink-900 dark:text-white">Peças sem preço cadastrado</h2>
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    Cotadas pelo balcão sem valor. {insights.priceListCoverage.masterPartsWithoutPrice} de{' '}
                    {insights.priceListCoverage.masterParts} itens da lista estão sem preço.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void downloadCsv('price-list-gaps')}
                  disabled={exporting !== null}
                  className="cv-secondary cv-touch-target flex items-center gap-1.5 px-2.5 text-[11px] disabled:opacity-50"
                >
                  <Icon name="download" className={`h-3.5 w-3.5 ${exporting === 'price-list-gaps' ? 'animate-spin' : ''}`} />
                  Exportar lacunas
                </button>
              </div>
              {insights.unpricedParts.length ? (
                <div className="max-h-[26rem] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-white dark:bg-ink-850">
                      <tr className="text-[10px] font-bold uppercase tracking-[.08em] text-ink-500">
                        <th className="px-4 py-2">Peça</th>
                        <th className="px-2 py-2 text-right">Pedidos</th>
                        <th className="px-4 py-2 text-right">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insights.unpricedParts.map(part => (
                        <tr key={part.normalizedPartNumber} className="border-t border-ink-200 dark:border-ink-800">
                          <td className="max-w-[18rem] px-4 py-2.5">
                            <div className="truncate font-semibold text-ink-900 dark:text-white" title={part.name}>{part.name}</div>
                            <div className="font-mono text-[11px] font-bold text-brand-600 dark:text-brand-300">
                              {formatHusqvarnaPartNumber(part.partNumber)}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-right font-bold tabular-nums">
                            {part.quoteCount}
                            <span className="block text-[10px] font-normal text-ink-500">{part.quotedQuantity} un.</span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {part.inPriceList ? (
                              <span className="text-[10px] font-bold text-gold-800 dark:text-gold-300">na lista, sem preço</span>
                            ) : (
                              <span className="text-[10px] font-bold text-accent-700 dark:text-accent-300">fora da lista</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-10 text-center text-xs text-ink-500">
                  Nenhuma peça foi cotada sem preço no período.
                </div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-card border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-850">
            <div className="border-b border-ink-200 px-4 py-3 dark:border-ink-800">
              <h2 className="text-sm font-bold text-ink-900 dark:text-white">Atividade por atendente</h2>
              <p className="mt-0.5 text-[11px] text-ink-500">Quem arquivou orçamento no período. Orçamento de atendente removido continua contando.</p>
            </div>
            {insights.attendants.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-[.08em] text-ink-500">
                      <th className="px-4 py-2">Atendente</th>
                      <th className="px-2 py-2 text-right">Orçamentos</th>
                      <th className="px-2 py-2 text-right">Itens</th>
                      <th className="px-2 py-2 text-right">Valor líquido</th>
                      <th className="px-2 py-2 text-right">Ticket médio</th>
                      <th className="px-4 py-2 text-right">Último</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.attendants.map(attendant => (
                      <tr key={attendant.userId || attendant.email} className="border-t border-ink-200 dark:border-ink-800">
                        <td className="px-4 py-2.5 font-semibold text-ink-900 dark:text-white">{attendant.email}</td>
                        <td className="px-2 py-2.5 text-right font-bold tabular-nums">{attendant.quotes}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-ink-500">{attendant.items}</td>
                        <td className="px-2 py-2.5 text-right font-mono font-semibold tabular-nums">{money(attendant.netTotal)}</td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums text-ink-500">{money(attendant.averageTicket)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ink-500">{relativeDate(attendant.lastQuoteAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-10 text-center text-xs text-ink-500">Nenhum atendimento arquivado no período.</div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
