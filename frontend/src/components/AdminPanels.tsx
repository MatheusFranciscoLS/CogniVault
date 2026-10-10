import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { api, fmtDate, json } from '../lib';
import { Search } from 'lucide-react';
import PageFrame from './PageFrame';
import PageTabs, { type PageTab } from './PageTabs';
import BandStat from './BandStat';
import { useUrlTab } from '../lib/use-url-tab';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { actionLabel, isLoginAction, targetLabel } from '../lib/audit-labels';
import type { AuditLog, Overview } from '../types';

// O uso de IA só é buscado quando a aba é aberta (a tela costuma ficar no registro de ações).
const AssistantObservabilityPanel = lazy(() => import('./AssistantObservabilityPanel'));

type OverviewTab = 'audit' | 'ai';

/** A aba vai no endereço (`?aba=ia`); a primeira é a padrão. */
const TAB_PARAM: Record<OverviewTab, string> = { audit: 'registro', ai: 'ia' };
const TABS: PageTab<OverviewTab>[] = [
  { id: 'audit', label: 'Registro de ações' },
  { id: 'ai', label: 'Uso de IA e cobertura técnica' },
];

const CHIP_OK = 'rounded-full bg-[rgba(93,211,151,.18)] px-2 py-0.5 font-semibold text-[#7be3ae]';
const CHIP_WARN = 'rounded-full bg-[rgba(255,212,92,.18)] px-2 py-0.5 font-semibold text-[#ffd45c]';
const CHIP_BAD = 'rounded-full bg-[rgba(255,138,128,.2)] px-2 py-0.5 font-semibold text-[#ffb4ab]';

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

  const [tab, setTab] = useUrlTab(TAB_PARAM);

  // Situação do processamento num selo só: "tudo em dia" é a resposta que o dono procura quando abre esta tela.
  const status = !data ? null
    : data.failedDocuments > 0 ? { tone: CHIP_BAD, text: `${data.failedDocuments} com falha` }
    : data.processingDocuments > 0 ? { tone: CHIP_WARN, text: `${data.processingDocuments} processando` }
    : { tone: CHIP_OK, text: 'Tudo em dia' };
  const stat = (value: number | undefined) => (value === undefined ? '—' : value.toLocaleString('pt-BR'));

  return (
    <PageFrame
      look="band"
      crumb="Administração"
      title="Visão geral"
      band={
        <div className="grid items-stretch gap-4 sm:grid-cols-3">
          <BandStat label="Catálogos ativos" value={stat(data?.activeDocuments)} caption={status ? <span className={status.tone}>{status.text}</span> : undefined} />
          <BandStat label="Peças consultáveis" value={stat(data?.parts)} caption="Códigos que o balcão acha na busca" />
          <BandStat label="Usuários ativos" value={stat(data?.users)} caption="Com acesso ao sistema" />
        </div>
      }
      tabs={<PageTabs tabs={TABS} value={tab} onChange={setTab} label="Seções da Visão geral" />}
    >
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"><span>{error}</span><button type="button" onClick={() => { setError(''); setRetry(value => value + 1); }} className="rounded-lg border border-destructive/40 px-3 py-1.5 text-sm font-bold">Tentar novamente</button></div>}

      {tab === 'audit' && (
        <div role="tabpanel" id="painel-audit" aria-labelledby="tab-audit">
          <AuditPanel />
        </div>
      )}
      {tab === 'ai' && (
        <div role="tabpanel" id="painel-ai" aria-labelledby="tab-ai">
          <Suspense fallback={<div className="rounded-card border border-border bg-card px-4 py-4 text-sm text-muted-foreground">Carregando uso de IA…</div>}>
            <AssistantObservabilityPanel />
          </Suspense>
        </div>
      )}
    </PageFrame>
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

