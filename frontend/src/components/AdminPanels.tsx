import { useEffect, useMemo, useState } from 'react';
import { api, fmtDate, json } from '../lib';
import type { AuditLog, Overview } from '../types';

function AdminHeading({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[.15em] text-brand-600 dark:text-brand-300">{kicker}</div>
        <h1 className="mt-1 text-2xl font-black tracking-[-.03em] text-ink-950 dark:text-white">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500 dark:text-ink-400">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function OverviewPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void api('/api/admin/overview')
      .then(response => json<{ overview: Overview }>(response))
      .then(response => { if (active) setData(response.overview); })
      .catch(loadError => { if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar a visão geral.'); });
    return () => { active = false; };
  }, [retry]);

  const metrics = data ? [
    ['Catálogos ativos', data.activeDocuments],
    ['Peças indexadas', data.parts],
    ['Usuários ativos', data.users],
    ['Acerto confirmado', data.feedbackAccuracy === null ? '—' : `${Math.round(data.feedbackAccuracy * 100)}%`],
  ] : [];

  return (
    <section className="mx-auto max-w-[1400px] space-y-4">
      <AdminHeading kicker="Administração" title="Visão geral" description="Situação da base técnica, acessos e sinais de qualidade sem misturar esses dados com o fluxo do balcão." />
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"><span>{error}</span><button type="button" onClick={() => { setError(''); setRetry(value => value + 1); }} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold dark:border-rose-700">Tentar novamente</button></div>}

      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <div className="grid divide-y divide-ink-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4 dark:divide-ink-800">
          {(data ? metrics : Array.from({ length: 4 }, (_, index) => [`Carregando ${index}`, '—'])).map(([label, value], index) => (
            <div key={String(label)} className="px-5 py-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-ink-500 dark:text-ink-400">{data ? label : 'Carregando'}</div>
              <div className="mt-2 text-2xl font-black tracking-[-.03em] text-ink-950 dark:text-white">{data ? value : '—'}</div>
              {data && index === 3 && <div className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">Validação registrada pelo balcão</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <div className="border-b border-ink-100 px-4 py-3 text-xs font-black text-ink-700 dark:border-ink-800 dark:text-ink-200">Situação operacional</div>
        <div className="grid divide-y divide-ink-100 md:grid-cols-3 md:divide-x md:divide-y-0 dark:divide-ink-800">
          <div className="flex items-center justify-between gap-4 px-4 py-4"><span className="text-xs font-semibold text-ink-500 dark:text-ink-400">Catálogos processando</span><span className="text-lg font-black text-amber-700 dark:text-amber-300">{data?.processingDocuments ?? '—'}</span></div>
          <div className="flex items-center justify-between gap-4 px-4 py-4"><span className="text-xs font-semibold text-ink-500 dark:text-ink-400">Catálogos com falha</span><span className="text-lg font-black text-rose-700 dark:text-rose-300">{data?.failedDocuments ?? '—'}</span></div>
          <div className="flex items-center justify-between gap-4 px-4 py-4"><span className="text-xs font-semibold text-ink-500 dark:text-ink-400">Feedbacks registrados</span><span className="text-lg font-black text-ink-900 dark:text-brand-300">{data?.feedbackTotal ?? '—'}</span></div>
        </div>
      </div>
    </section>
  );
}

export function AuditPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void api('/api/admin/audit')
      .then(response => json<{ logs: AuditLog[] }>(response))
      .then(response => { if (active) setLogs(response.logs); })
      .catch(loadError => { if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar a auditoria.'); });
    return () => { active = false; };
  }, [retry]);

  const label = (action: string): string => ({
    DOCUMENT_UPLOADED: 'Catálogo enviado',
    DOCUMENT_ARCHIVED: 'Catálogo arquivado',
    DOCUMENT_RESTORED: 'Catálogo restaurado',
    DOCUMENT_REPROCESSED: 'Catálogo reprocessado',
    DOCUMENT_CATEGORY_CHANGED: 'Seção alterada',
    USER_CREATED: 'Usuário criado',
    USER_UPDATED: 'Usuário alterado',
    USER_LOGIN: 'Login efetuado',
    AI_BENCHMARK_RUN: 'Benchmark executado',
    AI_TECHNICAL_KNOWLEDGE_REBUILT: 'Memória técnica reconstruída',
  }[action] || action);

  const normalized = filter.trim().toLocaleLowerCase('pt-BR');
  const filtered = useMemo(() => logs.filter(log => !normalized || [label(log.action), log.action, log.user?.email, log.targetType].some(value => value?.toLocaleLowerCase('pt-BR').includes(normalized))), [logs, normalized]);

  return (
    <section className="mx-auto max-w-[1400px] space-y-4">
      <AdminHeading kicker="Rastreabilidade" title="Auditoria" description="Ações administrativas relevantes, em ordem cronológica." />
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"><span>{error}</span><button type="button" onClick={() => { setError(''); setRetry(value => value + 1); }} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold dark:border-rose-700">Tentar novamente</button></div>}
      <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900"><div className="relative min-w-0 flex-1"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500 dark:text-ink-400">⌕</span><input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Ação, usuário ou recurso…" className="h-10 w-full rounded-lg border border-ink-200 bg-ink-50 pl-10 pr-3 text-sm outline-hidden dark:border-ink-700 dark:bg-ink-800" /></div><span className="px-1 text-xs font-semibold text-ink-500 dark:text-ink-400">{filtered.length} eventos</span></div>
      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <div className="hidden grid-cols-[minmax(230px,1fr)_minmax(180px,.8fr)_160px] gap-4 border-b border-ink-100 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-ink-500 dark:text-ink-400 md:grid dark:border-ink-800"><span>Ação</span><span>Responsável / recurso</span><span className="text-right">Data</span></div>
        {filtered.map(log => <div key={log.id} className="grid gap-2 border-b border-ink-100 px-4 py-3.5 last:border-0 md:grid-cols-[minmax(230px,1fr)_minmax(180px,.8fr)_160px] md:items-center dark:border-ink-800"><div className="text-sm font-bold text-ink-800 dark:text-ink-100">{label(log.action)}</div><div className="text-xs text-ink-500 dark:text-ink-400">{log.user?.email || 'Sistema'} · {log.targetType}</div><div className="text-xs text-ink-500 dark:text-ink-400 md:text-right">{fmtDate(log.createdAt)}</div></div>)}
        {!filtered.length && <div className="px-5 py-10 text-center text-sm text-ink-500 dark:text-ink-400">Nenhuma ação encontrada.</div>}
      </div>
    </section>
  );
}
