import { useEffect, useId, useMemo, useState } from 'react';
import { api, fmtDate, json } from '../lib';
import { ChevronDown, Search } from 'lucide-react';
import PageFrame from './PageFrame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

  // Situação do processamento num selo só: "tudo em dia" é a resposta que o dono procura quando abre esta tela.
  const status = !data ? null
    : data.failedDocuments > 0 ? { tone: 'text-destructive', text: `${data.failedDocuments} com falha` }
    : data.processingDocuments > 0 ? { tone: 'text-warn', text: `${data.processingDocuments} processando` }
    : { tone: 'text-ok', text: 'Tudo em dia' };

  return (
    <PageFrame title="Visão geral">
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"><span>{error}</span><button type="button" onClick={() => { setError(''); setRetry(value => value + 1); }} className="rounded-lg border border-destructive/40 px-3 py-1.5 text-sm font-bold">Tentar novamente</button></div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Catálogos ativos" value={data?.activeDocuments} footer={status ? <span className={`font-semibold ${status.tone}`}>{status.text}</span> : undefined} />
        <KpiCard label="Peças consultáveis" value={data?.parts} footer="Códigos que o balcão acha na busca" />
        <KpiCard label="Usuários ativos" value={data?.users} footer="Com acesso ao sistema" />
      </div>
    </PageFrame>
  );
}

function KpiCard({ label, value, footer }: { label: string; value: number | undefined; footer?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-base font-semibold text-muted-foreground">{label}</div>
      <div className="mt-2 text-4xl font-semibold tabular-nums">{value === undefined ? <span className="text-muted-foreground" aria-busy="true">—</span> : value.toLocaleString('pt-BR')}</div>
      {footer && <div className="mt-2 text-base text-muted-foreground">{footer}</div>}
    </div>
  );
}

/** Seção recolhida: o que só o dono técnico consulta (IA, cache, rota do Portal) não disputa a tela com o que ele olha todo dia. */
export function TechnicalDetails({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="mx-auto w-full max-w-[1400px]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <span className="text-lg font-semibold">{title}</span>
        <ChevronDown className={`size-5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <div id={id} hidden={!open}>{open && children}</div>
    </section>
  );
}

const AUDIT_PAGE = 15;

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
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Ação</TableHead>
            <TableHead>Quem fez · o quê</TableHead>
            <TableHead className="text-right">Data</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map(log => (
            <TableRow key={log.id}>
              <TableCell className="font-semibold">{actionLabel(log.action)}</TableCell>
              <TableCell className="max-w-0 truncate text-muted-foreground">{log.user?.name || log.user?.email || 'Sistema'} · {targetLabel(log.targetType)}</TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{fmtDate(log.createdAt)}</TableCell>
            </TableRow>
          ))}
          {!filtered.length && <TableEmpty colSpan={3}>Nenhuma ação encontrada.</TableEmpty>}
        </TableBody>
      </Table>
      {filtered.length > shown && (
        <div className="text-center">
          <Button type="button" variant="outline" onClick={() => setShown(value => value + AUDIT_PAGE)}>Mostrar mais {Math.min(AUDIT_PAGE, filtered.length - shown)}</Button>
        </div>
      )}
    </section>
  );
}

