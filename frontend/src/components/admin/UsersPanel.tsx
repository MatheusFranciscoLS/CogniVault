import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiJson, fmtDate, json } from '../../lib';
import { useConfirm } from '../../context/confirm';
import type { AdminUser, Role } from '../../types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import AdminPage from './AdminPage';

const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Administrador', MECHANIC: 'Balcão' };
const STATUS: Record<AdminUser['status'], { label: string; className: string }> = {
  APPROVED: { label: 'Ativo', className: 'bg-ok-soft text-ok' },
  REJECTED: { label: 'Bloqueado', className: 'bg-destructive/10 text-destructive' },
  PENDING: { label: 'Pendente', className: 'bg-warn-soft text-warn' },
};

function fetchUsers() {
  return apiJson<{ users: AdminUser[] }>('/api/admin/users');
}

/** Usuários do sistema: criar acesso, mudar perfil, bloquear e redefinir senha. */
export default function UsersPanel() {
  const confirm = useConfirm();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [email, setEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [nameFor, setNameFor] = useState<AdminUser | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('MECHANIC');
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [passwordFor, setPasswordFor] = useState<AdminUser | null>(null);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [passwordError, setPasswordError] = useState('');

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
        body: JSON.stringify({ email, password, role, name: newName.trim() || undefined }),
      }));
      setEmail('');
      setNewName('');
      setPassword('');
      setRole('MECHANIC');
      setCreateOpen(false);
      await load();
      toast.success('Novo usuário cadastrado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário');
    }
  };

  const update = async (id: string, patch: object, message = 'Usuário atualizado.') => {
    try {
      await json(await api(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }));
      await load();
      toast.success(message);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar usuário');
      return false;
    }
  };

  const toggleRole = async (user: AdminUser) => {
    const toAdmin = user.role !== 'ADMIN';
    const ok = await confirm({
      title: toAdmin ? `Tornar ${user.email} administrador?` : `Tornar ${user.email} Balcão?`,
      description: toAdmin ? 'Administrador vê a loja inteira e mexe em usuários.' : 'Perde o acesso às telas de administração.',
      confirmLabel: toAdmin ? 'Tornar administrador' : 'Tornar Balcão',
    });
    if (ok) await update(user.id, { role: toAdmin ? 'ADMIN' : 'MECHANIC' });
  };

  const toggleBlock = async (user: AdminUser) => {
    if (user.status === 'APPROVED') {
      const ok = await confirm({ title: `Bloquear ${user.email}?`, description: 'A pessoa sai do sistema na hora e não consegue entrar de novo até ser ativada.', confirmLabel: 'Bloquear', destructive: true });
      if (ok) await update(user.id, { status: 'REJECTED' }, 'Usuário bloqueado.');
    } else {
      await update(user.id, { status: 'APPROVED' }, 'Usuário ativado.');
    }
  };

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    if (!nameFor) return;
    if (await update(nameFor.id, { name: nameDraft.trim() || null }, 'Nome atualizado.')) setNameFor(null);
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordFor) return;
    if (passwordDraft.length < 15 || passwordDraft.length > 64 || new TextEncoder().encode(passwordDraft).length > 72) {
      setPasswordError('A senha precisa ter de 15 a 64 caracteres.');
      return;
    }
    if (await update(passwordFor.id, { password: passwordDraft }, 'Senha redefinida.')) {
      setPasswordFor(null);
      setPasswordDraft('');
      setPasswordError('');
    }
  };

  const normalized = filter.trim().toLocaleLowerCase('pt-BR');
  const filtered = useMemo(
    () => users.filter(user => !normalized || [user.email, user.name ?? '', ROLE_LABEL[user.role], STATUS[user.status].label].some(value => value.toLocaleLowerCase('pt-BR').includes(normalized))),
    [normalized, users],
  );

  return (
    <AdminPage title="Usuários" action={<Button onClick={() => setCreateOpen(value => !value)}>{createOpen ? 'Fechar' : 'Novo usuário'}</Button>}>
      {error && <p role="alert" className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-base text-destructive">{error}</p>}

      {createOpen && (
        <form onSubmit={create} className="grid gap-3 rounded-xl border border-border bg-card p-5 lg:grid-cols-[minmax(200px,1fr)_minmax(200px,1fr)_minmax(200px,1fr)_180px_auto]">
          <Input maxLength={80} value={newName} onChange={event => setNewName(event.target.value)} placeholder="Nome (sai no orçamento)" aria-label="Nome do novo usuário" className="h-11" />
          <Input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="E-mail" aria-label="E-mail do novo usuário" className="h-11" />
          <Input required minLength={15} maxLength={64} type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Senha inicial (mínimo 15 caracteres)" aria-label="Senha inicial" className="h-11" />
          <select value={role} onChange={event => setRole(event.target.value as Role)} aria-label="Perfil" className="h-11 rounded-md border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/60">
            <option value="MECHANIC">Balcão</option>
            <option value="ADMIN">Administrador</option>
          </select>
          <Button type="submit" className="h-11">Criar acesso</Button>
        </form>
      )}

      <div className="flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filtrar por e-mail, perfil ou status" aria-label="Filtrar usuários" className="h-11 pl-10" />
        </div>
        <span className="text-base text-muted-foreground">{filtered.length} {filtered.length === 1 ? 'usuário' : 'usuários'}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden grid-cols-[minmax(0,1fr)_160px_130px_56px] gap-4 border-b border-border bg-muted px-5 py-3 text-base font-semibold text-muted-foreground md:grid">
          <span>Usuário</span><span>Perfil</span><span>Status</span><span className="sr-only">Ações</span>
        </div>
        <ul className="divide-y divide-border">
          {filtered.map(user => (
            <li key={user.id} className="grid items-center gap-x-4 gap-y-1 px-5 py-4 md:grid-cols-[minmax(0,1fr)_160px_130px_56px]">
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold">{user.name || user.email}</div>
                <div className="truncate text-base text-muted-foreground">{user.name ? `${user.email} · ` : ''}desde {fmtDate(user.createdAt)}{!user.name && ' · sem nome (o orçamento sai sem ATT.)'}</div>
              </div>
              <span className="text-base">{ROLE_LABEL[user.role]}</span>
              <span><span className={cn('rounded-md px-2 py-0.5 text-base font-semibold', STATUS[user.status].className)}>{STATUS[user.status].label}</span></span>
              <div className="justify-self-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Ações de ${user.email}`}>
                      <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-52">
                    <DropdownMenuItem onSelect={() => void toggleRole(user)} className="h-10 text-base">{user.role === 'ADMIN' ? 'Tornar Balcão' : 'Tornar administrador'}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => { setNameFor(user); setNameDraft(user.name ?? ''); }} className="h-10 text-base">Definir nome</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void toggleBlock(user)} className="h-10 text-base">{user.status === 'APPROVED' ? 'Bloquear' : 'Ativar'}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => { setPasswordFor(user); setPasswordDraft(''); setPasswordError(''); }} className="h-10 text-base">Redefinir senha</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
          {!filtered.length && <li className="px-5 py-10 text-center text-base text-muted-foreground">Nenhum usuário encontrado.</li>}
        </ul>
      </div>

      <Dialog open={nameFor !== null} onOpenChange={open => { if (!open) setNameFor(null); }}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={saveName} className="grid gap-4">
            <DialogHeader>
              <DialogTitle className="text-2xl font-semibold">Nome do usuário</DialogTitle>
              <DialogDescription className="text-base">{nameFor?.email}. É o que sai em "ATT." no orçamento do cliente.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <label htmlFor="user-name" className="text-base font-semibold">Nome como a pessoa se apresenta</label>
              <Input id="user-name" autoFocus maxLength={80} value={nameDraft} onChange={event => setNameDraft(event.target.value)} placeholder="Matheus Francisco" className="h-11" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNameFor(null)}>Cancelar</Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordFor !== null} onOpenChange={open => { if (!open) setPasswordFor(null); }}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={resetPassword} className="grid gap-4">
            <DialogHeader>
              <DialogTitle className="text-2xl font-semibold">Redefinir senha</DialogTitle>
              <DialogDescription className="text-base">{passwordFor?.email}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <label htmlFor="new-password" className="text-base font-semibold">Nova senha</label>
              <Input id="new-password" autoFocus type="password" autoComplete="new-password" minLength={15} maxLength={64} value={passwordDraft} onChange={event => { setPasswordDraft(event.target.value); setPasswordError(''); }} placeholder="De 15 a 64 caracteres" className="h-11" />
              {passwordError && <p role="alert" className="text-base text-destructive">{passwordError}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPasswordFor(null)}>Cancelar</Button>
              <Button type="submit">Redefinir</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}
