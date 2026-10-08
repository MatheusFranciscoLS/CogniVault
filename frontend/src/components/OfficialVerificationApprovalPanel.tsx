import { useCallback, useEffect, useState } from 'react';
import { apiJson, fmtDate } from '../lib';
import type { OfficialVerificationSubmission } from '../types';

type Props = { onChanged?: () => void };

function statusLabel(item: OfficialVerificationSubmission) {
  if (item.status === 'SUPERSEDED') return 'Substituição informada';
  if (item.status === 'VERIFIED') return 'Código confirmado';
  return 'Revisão manual';
}

export default function OfficialVerificationApprovalPanel({ onChanged }: Props) {
  const [items, setItems] = useState<OfficialVerificationSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const data = await apiJson<{ submissions: OfficialVerificationSubmission[] }>('/api/part-verifications/pending');
    setItems(data.submissions);
    setError('');
  }, []);

  useEffect(() => {
    let active = true;
    void apiJson<{ submissions: OfficialVerificationSubmission[] }>('/api/part-verifications/pending')
      .then(data => { if (active) setItems(data.submissions); })
      .catch(loadError => { if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as pendências.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const decide = async (item: OfficialVerificationSubmission, decision: 'APPROVE' | 'REJECT') => {
    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      const data = await apiJson<{ message: string }>(`/api/part-verifications/${item.id}/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: notes[item.id] || undefined }),
      });
      setNotice(data.message);
      setNotes(current => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      await load();
      onChanged?.();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'Não foi possível revisar a conferência.');
    } finally {
      setBusyId(null);
    }
  };

  if (!loading && !items.length && !notice && !error) return null;

  return (
    <div className="rounded-xl border border-border bg-card mt-5 overflow-hidden border border-brand-100 dark:border-brand-700">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-brand-50 dark:bg-ink-900/40 p-4">
        <div>
          <div className="text-sm font-semibold text-foreground">Conferências aguardando aprovação</div>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">O Balcão já conferiu no Portal. Abra a fonte oficial e aprove ou rejeite. Enquanto estiver pendente, nada muda nas buscas.</p>
        </div>
        {!loading && <span className="rounded-full bg-card px-2.5 py-1 text-sm font-semibold text-brand-600 dark:text-brand-300 ring-1 ring-brand-100">{items.length} pendente{items.length === 1 ? '' : 's'}</span>}
      </div>

      {notice && <div role="status" className="m-4 rounded-xl border border-ok/40 bg-ok-soft p-3 text-sm text-ok">{notice}</div>}
      {error && <div role="alert" className="m-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {loading && <div className="p-5 text-sm text-muted-foreground">Carregando conferências…</div>}

      {!loading && items.length > 0 && (
        <div className="divide-y divide-ink-100">
          {items.map(item => {
            const changed = item.queriedPartNumber.replace(/\W/g, '') !== item.currentPartNumber.replace(/\W/g, '');
            return (
              <div key={item.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_310px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${changed ? 'bg-brand-50 dark:bg-ink-900 text-brand-700 dark:text-brand-300' : 'bg-ok-soft text-ok'}`}>{statusLabel(item)}</span>
                    <span className="text-sm text-muted-foreground">{fmtDate(item.verifiedAt)} · {item.submittedBy}</span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-foreground">{item.description || 'Peça sem descrição informada'}</div>
                  <div className="mt-1 text-lg font-bold tracking-tight text-brand-600 dark:text-brand-300">
                    {changed ? <><span className="text-muted-foreground line-through">{item.queriedPartNumber}</span> → {item.currentPartNumber}</> : item.currentPartNumber}
                  </div>
                  {item.note && <div className="mt-2 rounded-xl bg-muted p-3 text-sm leading-5 text-muted-foreground">{item.note}</div>}
                  <a href={item.officialUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-xl border border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-ink-900 px-3 py-2 text-sm font-semibold text-brand-600 dark:text-brand-300">Conferir no Portal Husqvarna →</a>
                </div>

                <div className="rounded-2xl border border-border bg-muted p-3">
                  <label className="text-sm font-bold   text-muted-foreground">
                    Observação da revisão
                    <textarea value={notes[item.id] || ''} onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))} maxLength={1000} rows={2} placeholder="Opcional" className="mt-1 w-full rounded-xl border border-border bg-card p-2.5 text-sm font-normal normal-case tracking-normal text-ink-700 dark:text-ink-300" />
                  </label>
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={busyId === item.id} onClick={() => void decide(item, 'APPROVE')} className="flex-1 rounded-xl bg-ok px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyId === item.id ? 'Salvando…' : 'Aprovar'}</button>
                    <button type="button" disabled={busyId === item.id} onClick={() => void decide(item, 'REJECT')} className="flex-1 rounded-xl border border-destructive/40 bg-card px-3 py-2 text-sm font-semibold text-destructive disabled:opacity-50">Rejeitar</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
