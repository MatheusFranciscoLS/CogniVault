import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api, apiJson, fmtDate, json } from '../lib';
import { toast } from 'sonner';
import type { AdminUser, AuditLog, Overview, Role } from '../types';

function fetchUsers() {
  return apiJson<{ users: AdminUser[] }>('/api/admin/users');
}

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
              <div className="text-[10px] font-black uppercase tracking-[.1em] text-ink-500 dark:text-ink-400">{data ? label : 'Carregando'}</div>
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

export function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('MECHANIC');
  const [error, setError] = useState('');
  const [passwordUser, setPasswordUser] = useState<string | null>(null);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const load = async () => setUsers((await fetchUsers()).users);
  useEffect(() => {
    let active = true;
    void fetchUsers()
      .then(data => { if (active) setUsers(data.users); })
      .catch(loadError => { if (active) setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar usuários.'); });
    return () => { active = false; };
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await json(await api('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      }));
      setEmail('');
      setPassword('');
      setRole('MECHANIC');
      setCreateOpen(false);
      await load();
      toast.success('Novo usuário cadastrado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário');
    }
  };

  const update = async (id: string, patch: object) => {
    try {
      await json(await api(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }));
      await load();
      toast.success('Usuário atualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar usuário');
    }
  };

  const reset = async (event: FormEvent, id: string) => {
    event.preventDefault();
    if (passwordDraft.length < 15 || passwordDraft.length > 64 || new TextEncoder().encode(passwordDraft).length > 72) {
      setError('A nova senha precisa ter entre 15 e 64 caracteres e respeitar o limite seguro do bcrypt.');
      return;
    }
    await update(id, { password: passwordDraft });
    setPasswordDraft('');
    setPasswordUser(null);
    toast.success('Senha redefinida com sucesso.');
  };

  const normalized = filter.trim().toLocaleLowerCase('pt-BR');
  const filtered = useMemo(() => users.filter(user => !normalized || [user.email, user.role, user.status].some(value => value.toLocaleLowerCase('pt-BR').includes(normalized))), [normalized, users]);

  return (
    <section className="mx-auto max-w-[1400px] space-y-4">
      <AdminHeading
        kicker="Controle de acesso"
        title="Usuários"
        description="Crie acessos, altere perfil, bloqueie contas e redefina senhas."
        action={<button type="button" onClick={() => setCreateOpen(value => !value)} className="self-start rounded-lg bg-ink-900 px-4 py-2.5 text-xs font-black text-white transition hover:bg-ink-950">{createOpen ? 'Fechar' : 'Novo usuário'}</button>}
      />

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

      {createOpen && (
        <form onSubmit={create} className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <div className="mb-3 text-xs font-black text-ink-700 dark:text-ink-200">Novo acesso</div>
          <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_170px_auto]">
            <input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="email@empresa.com" className="h-11 rounded-lg border border-ink-200 bg-ink-50 px-3 text-sm outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-500/10 dark:border-ink-700 dark:bg-ink-800" />
            <input required minLength={15} maxLength={64} type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Senha inicial · mínimo 15 caracteres" className="h-11 rounded-lg border border-ink-200 bg-ink-50 px-3 text-sm outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-500/10 dark:border-ink-700 dark:bg-ink-800" />
            <select value={role} onChange={event => setRole(event.target.value as Role)} className="h-11 rounded-lg border border-ink-200 bg-white px-3 text-xs font-bold dark:border-ink-700 dark:bg-ink-800"><option value="MECHANIC">Balcão</option><option value="ADMIN">Administrador</option></select>
            <button className="h-11 rounded-lg bg-ink-900 px-5 text-xs font-black text-white">Criar acesso</button>
          </div>
        </form>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
        <div className="relative min-w-0 flex-1"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500 dark:text-ink-400">⌕</span><input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filtrar por e-mail, perfil ou status…" className="h-10 w-full rounded-lg border border-ink-200 bg-ink-50 pl-10 pr-3 text-sm outline-none dark:border-ink-700 dark:bg-ink-800" /></div>
        <span className="px-1 text-xs font-semibold text-ink-500 dark:text-ink-400">{filtered.length} usuários</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <table className="w-full min-w-[850px] text-sm">
          <thead className="border-b border-ink-100 bg-ink-50/70 text-left text-[10px] font-black uppercase tracking-[.1em] text-ink-500 dark:text-ink-400 dark:border-ink-800 dark:bg-ink-800/50"><tr><th className="px-4 py-3">Usuário</th><th>Perfil</th><th>Status</th><th>Feedback</th><th className="px-4 text-right">Ações</th></tr></thead>
          <tbody>
            {filtered.map(user => (
              <tr key={user.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/70 dark:border-ink-800 dark:hover:bg-ink-800/40">
                <td className="px-4 py-3"><div className="font-bold text-ink-800 dark:text-ink-100">{user.email}</div><div className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">desde {fmtDate(user.createdAt)}</div></td>
                <td className="text-xs font-semibold text-ink-600 dark:text-ink-300">{user.role === 'ADMIN' ? 'Administrador' : 'Balcão'}</td>
                <td><span className={`text-xs font-bold ${user.status === 'APPROVED' ? 'text-emerald-700 dark:text-emerald-300' : user.status === 'REJECTED' ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>{user.status === 'APPROVED' ? 'Ativo' : user.status === 'REJECTED' ? 'Bloqueado' : 'Pendente'}</span></td>
                <td className="text-xs text-ink-500 dark:text-ink-400">{user.feedbackCount}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <button type="button" onClick={() => void update(user.id, { role: user.role === 'ADMIN' ? 'MECHANIC' : 'ADMIN' })} className="rounded-lg border border-ink-200 px-2.5 py-2 text-xs font-bold text-ink-500 dark:border-ink-700 dark:text-ink-300">{user.role === 'ADMIN' ? 'Tornar Balcão' : 'Tornar Admin'}</button>
                    <button type="button" onClick={() => void update(user.id, { status: user.status === 'APPROVED' ? 'REJECTED' : 'APPROVED' })} className="rounded-lg border border-ink-200 px-2.5 py-2 text-xs font-bold text-ink-500 dark:border-ink-700 dark:text-ink-300">{user.status === 'APPROVED' ? 'Bloquear' : 'Ativar'}</button>
                    <button type="button" onClick={() => { setPasswordUser(passwordUser === user.id ? null : user.id); setPasswordDraft(''); }} className="rounded-lg border border-ink-200 px-2.5 py-2 text-xs font-bold text-ink-500 dark:border-ink-700 dark:text-ink-300">Senha</button>
                  </div>
                  {passwordUser === user.id && <form onSubmit={event => void reset(event, user.id)} className="mt-2 flex justify-end gap-2"><input minLength={15} maxLength={64} type="password" autoComplete="new-password" value={passwordDraft} onChange={event => setPasswordDraft(event.target.value)} placeholder="Nova senha" className="h-9 min-w-[220px] rounded-lg border border-ink-200 bg-ink-50 px-3 text-xs outline-none dark:border-ink-700 dark:bg-ink-800" /><button className="rounded-lg bg-ink-900 px-3 text-xs font-black text-white">Salvar</button></form>}
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-ink-500 dark:text-ink-400">Nenhum usuário encontrado.</td></tr>}
          </tbody>
        </table>
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
      <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900"><div className="relative min-w-0 flex-1"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500 dark:text-ink-400">⌕</span><input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Ação, usuário ou recurso…" className="h-10 w-full rounded-lg border border-ink-200 bg-ink-50 pl-10 pr-3 text-sm outline-none dark:border-ink-700 dark:bg-ink-800" /></div><span className="px-1 text-xs font-semibold text-ink-500 dark:text-ink-400">{filtered.length} eventos</span></div>
      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <div className="hidden grid-cols-[minmax(230px,1fr)_minmax(180px,.8fr)_160px] gap-4 border-b border-ink-100 px-4 py-2.5 text-[10px] font-black uppercase tracking-[.1em] text-ink-500 dark:text-ink-400 md:grid dark:border-ink-800"><span>Ação</span><span>Responsável / recurso</span><span className="text-right">Data</span></div>
        {filtered.map(log => <div key={log.id} className="grid gap-2 border-b border-ink-100 px-4 py-3.5 last:border-0 md:grid-cols-[minmax(230px,1fr)_minmax(180px,.8fr)_160px] md:items-center dark:border-ink-800"><div className="text-sm font-bold text-ink-800 dark:text-ink-100">{label(log.action)}</div><div className="text-xs text-ink-500 dark:text-ink-400">{log.user?.email || 'Sistema'} · {log.targetType}</div><div className="text-xs text-ink-500 dark:text-ink-400 md:text-right">{fmtDate(log.createdAt)}</div></div>)}
        {!filtered.length && <div className="px-5 py-10 text-center text-sm text-ink-500 dark:text-ink-400">Nenhuma ação encontrada.</div>}
      </div>
    </section>
  );
}
