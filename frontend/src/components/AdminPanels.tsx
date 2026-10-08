import { useEffect, useMemo, useState } from 'react';
import { api, fmtDate, json } from '../lib';
import { Search } from 'lucide-react';
import PageFrame from './PageFrame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { actionLabel, isLoginAction, targetLabel } from '../lib/audit-labels';
import type { AuditLog, Overview } from '../types';

function AdminHeading({ title, action, level = 1 }: { title: string; action?: React.ReactNode; level?: 1 | 2 }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {level === 1
        ? <h1 className="text-3xl font-semibold leading-9">{title}</h1>
        : <h2 className="text-2xl font-semibold leading-8">{title}</h2>}
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
    ['Catálogos ativos', data.activeDocuments.toLocaleString('pt-BR')],
    ['Peças indexadas', data.parts.toLocaleString('pt-BR')],
    ['Usuários ativos', data.users.toLocaleString('pt-BR')],
  ] : [];

  return (
    <PageFrame title="Visão geral">
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"><span>{error}</span><button type="button" onClick={() => { setError(''); setRetry(value => value + 1); }} className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-bold dark:border-rose-700">Tentar novamente</button></div>}

      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <div className="grid divide-y divide-ink-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-ink-800">
          {(data ? metrics : Array.from({ length: 3 }, (_, index) => [`Carregando ${index}`, '—'])).map(([label, value]) => (
            <div key={String(label)} className="px-5 py-4">
              <div className="text-sm font-semibold text-ink-500 dark:text-ink-400">{data ? label : 'Carregando'}</div>
              <div className="mt-2 text-2xl font-semibold text-ink-950 dark:text-white">{data ? value : '—'}</div>
                </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <div className="border-b border-ink-100 px-4 py-3 text-sm font-semibold text-ink-700 dark:border-ink-800 dark:text-ink-200">Situação operacional</div>
        <div className="grid divide-y divide-ink-100 md:grid-cols-2 md:divide-x md:divide-y-0 dark:divide-ink-800">
          <div className="flex items-center justify-between gap-4 px-4 py-4"><span className="text-sm font-semibold text-ink-500 dark:text-ink-400">Catálogos processando</span><span className="text-lg font-semibold text-amber-700 dark:text-amber-300">{data?.processingDocuments ?? '—'}</span></div>
          <div className="flex items-center justify-between gap-4 px-4 py-4"><span className="text-sm font-semibold text-ink-500 dark:text-ink-400">Catálogos com falha</span><span className="text-lg font-semibold text-rose-700 dark:text-rose-300">{data?.failedDocuments ?? '—'}</span></div>
        </div>
      </div>
    </PageFrame>
  );
}

const AUDIT_PAGE = 25;

export function AuditPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filter, setFilter] = useState('');
  const [withLogins, setWithLogins] = useState(false);
  const [shown, setShown] = useState(AUDIT_PAGE);
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

  const normalized = filter.trim().toLocaleLowerCase('pt-BR');
  const filtered = useMemo(() => logs.filter(log => {
    if (!withLogins && isLoginAction(log.action)) return false;
    if (!normalized) return true;
    return [actionLabel(log.action), log.action, log.user?.name, log.user?.email, targetLabel(log.targetType)]
      .some(value => value?.toLocaleLowerCase('pt-BR').includes(normalized));
  }), [logs, normalized, withLogins]);
  const visible = filtered.slice(0, shown);

  return (
    <section className="mx-auto w-full max-w-[1400px] space-y-4">
      <AdminHeading level={2} title="Registro de ações" />
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-base text-destructive"><span>{error}</span><Button type="button" variant="outline" size="sm" onClick={() => { setError(''); setRetry(value => value + 1); }}>Tentar novamente</Button></div>}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
        <div className="relative min-w-0 flex-1 basis-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={filter} onChange={event => { setFilter(event.target.value); setShown(AUDIT_PAGE); }} placeholder="Ação, usuário ou recurso…" aria-label="Filtrar o registro de ações" className="pl-9 text-base" />
        </div>
        <Button type="button" variant="outline" aria-pressed={withLogins} onClick={() => { setWithLogins(value => !value); setShown(AUDIT_PAGE); }} className={withLogins ? 'border-ring bg-selected' : undefined}>Incluir logins</Button>
        <span className="px-1 text-base text-muted-foreground tabular-nums">{filtered.length} {filtered.length === 1 ? 'evento' : 'eventos'}</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden grid-cols-[minmax(230px,1fr)_minmax(180px,.8fr)_160px] gap-4 border-b border-border bg-muted px-4 py-2.5 text-sm font-semibold text-muted-foreground md:grid"><span>Ação</span><span>Quem fez · o quê</span><span className="text-right">Data</span></div>
        {visible.map(log => (
          <div key={log.id} className="grid gap-1 border-b border-border px-4 py-3 last:border-0 md:grid-cols-[minmax(230px,1fr)_minmax(180px,.8fr)_160px] md:items-center md:gap-4">
            <div className="text-base font-semibold">{actionLabel(log.action)}</div>
            <div className="truncate text-base text-muted-foreground">{log.user?.name || log.user?.email || 'Sistema'} · {targetLabel(log.targetType)}</div>
            <div className="text-base text-muted-foreground tabular-nums md:text-right">{fmtDate(log.createdAt)}</div>
          </div>
        ))}
        {!filtered.length && <div className="px-5 py-10 text-center text-base text-muted-foreground">Nenhuma ação encontrada.</div>}
        {filtered.length > shown && (
          <div className="border-t border-border bg-muted px-4 py-3 text-center">
            <Button type="button" variant="outline" onClick={() => setShown(value => value + AUDIT_PAGE)}>Mostrar mais {Math.min(AUDIT_PAGE, filtered.length - shown)}</Button>
          </div>
        )}
      </div>
    </section>
  );
}

