import { useEffect, useMemo, useState } from 'react';
import { api, fmtDate, json } from '../lib';
import type { AdminFeedback } from '../types';

const reasonLabel: Record<string, string> = {
  WRONG_CODE: 'Código incorreto',
  WRONG_PNC: 'PNC incorreto',
  WRONG_MODEL: 'Modelo incorreto',
  WRONG_PART: 'Peça incorreta',
  OTHER: 'Outro motivo',
  TREINAMENTO_INICIAL: 'Sinal inicial de alto giro',
};

export default function AdminFeedbackPanel() {
  const [items, setItems] = useState<AdminFeedback[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    uniqueSignals: number;
    positive: number;
    corrected: number;
    negativeWithoutCorrection: number;
    accuracy: number | null;
    reasons: Record<string, number>;
    learningLevel: 'COLD_START' | 'LEARNING' | 'ESTABLISHED';
    nextMilestone: number | null;
  }>({ total: 0, uniqueSignals: 0, positive: 0, corrected: 0, negativeWithoutCorrection: 0, accuracy: null, reasons: {}, learningLevel: 'COLD_START', nextMilestone: 5 });
  const [filter, setFilter] = useState<'all' | 'positive' | 'negative'>('all');
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await json<{ summary: typeof summary; feedback: AdminFeedback[] }>(await api('/api/admin/feedback'));
      setSummary(data.summary);
      setItems(data.feedback);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os feedbacks.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void api('/api/admin/feedback')
      .then(response => json<{ summary: typeof summary; feedback: AdminFeedback[] }>(response))
      .then(data => { if (active) { setSummary(data.summary); setItems(data.feedback); } })
      .catch(requestError => { if (active) setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os feedbacks.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function seedKnowledge() {
    if (!window.confirm('Inicializar sinais verificados com peças de alto giro encontradas nos catálogos?')) return;
    setSeeding(true); setError(''); setNotice('');
    try {
      const response = await json<{ message: string; createdCount: number }>(await api('/api/admin/feedback/seed-knowledge', { method: 'POST' }));
      setNotice(response.message);
      await load();
    } catch (seedError) {
      setError(seedError instanceof Error ? seedError.message : 'Erro ao inicializar sinais.');
    } finally { setSeeding(false); }
  }

  async function deleteFeedback(id: string) {
    if (!window.confirm('Deseja excluir este registro de feedback?')) return;
    setDeletingId(id); setError(''); setNotice('');
    try {
      await json<{ message: string }>(await api(`/api/admin/feedback/${id}`, { method: 'DELETE' }));
      setNotice('Feedback removido com sucesso.');
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Erro ao excluir feedback.');
    } finally { setDeletingId(null); }
  }

  const visible = useMemo(() => items.filter(item => filter === 'all' || (filter === 'positive' ? item.correct : !item.correct)), [items, filter]);
  const topReason = Object.entries(summary.reasons).sort((a, b) => b[1] - a[1])[0];
  const learningLabel = summary.learningLevel === 'ESTABLISHED' ? 'Estabelecida' : summary.learningLevel === 'LEARNING' ? 'Em aprendizado' : 'Inicial';

  return (
    <section className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.15em] text-brand-600 dark:text-brand-300">Qualidade da busca</div>
          <h1 className="mt-1 text-2xl font-black tracking-[-.03em] text-ink-950 dark:text-white">Feedback</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500 dark:text-ink-400">Confirmações e correções do balcão que ajudam o ranking a priorizar resultados mais confiáveis.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={seeding || loading} onClick={() => void seedKnowledge()} className="rounded-lg border border-ink-200 px-3 py-2 text-xs font-bold text-ink-600 transition hover:border-brand-300 hover:text-brand-600 disabled:opacity-50 dark:border-ink-700 dark:text-ink-300">{seeding ? 'Inicializando…' : 'Inicializar alto giro'}</button>
          <button type="button" disabled={loading} onClick={() => void load()} className="rounded-lg bg-ink-900 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{loading ? 'Atualizando…' : 'Atualizar'}</button>
        </div>
      </div>

      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <div className="grid divide-y divide-ink-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4 dark:divide-ink-800">
          <div className="px-4 py-4"><div className="text-[10px] font-black uppercase tracking-[.1em] text-ink-500 dark:text-ink-400">Sinais independentes</div><div className="mt-2 text-2xl font-black">{loading ? '—' : summary.uniqueSignals}</div><div className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">{summary.total} avaliações registradas</div></div>
          <div className="px-4 py-4"><div className="text-[10px] font-black uppercase tracking-[.1em] text-ink-500 dark:text-ink-400">Confirmados</div><div className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">{loading ? '—' : summary.positive}</div><div className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">Resultados aprovados</div></div>
          <div className="px-4 py-4"><div className="text-[10px] font-black uppercase tracking-[.1em] text-ink-500 dark:text-ink-400">Corrigidos</div><div className="mt-2 text-2xl font-black text-ink-900 dark:text-brand-300">{loading ? '—' : summary.corrected}</div><div className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">Peça correta informada</div></div>
          <div className="px-4 py-4"><div className="text-[10px] font-black uppercase tracking-[.1em] text-ink-500 dark:text-ink-400">Base</div><div className="mt-2 text-lg font-black text-ink-900 dark:text-white">{loading ? '—' : learningLabel}</div><div className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">{summary.nextMilestone ? `Próximo estágio: ${summary.nextMilestone} sinais` : 'Consenso estabelecido'}</div></div>
        </div>
        <div className="border-t border-ink-100 px-4 py-3 text-[11px] leading-5 text-ink-500 dark:border-ink-800 dark:text-ink-400">Um voto isolado tem peso pequeno; confirmações independentes e correções explícitas ganham mais peso dentro de limites seguros.{topReason ? ` Motivo mais frequente: ${reasonLabel[topReason[0]] || topReason[0]} (${topReason[1]}).` : ''}</div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
        <div className="flex gap-1.5">{([['all','Todos'],['positive','Corretos'],['negative','Incorretos']] as const).map(([id,label]) => <button key={id} type="button" onClick={() => setFilter(id)} className={`rounded-lg px-3 py-2 text-xs font-bold ${filter === id ? 'bg-ink-900 text-white' : 'text-ink-500 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'}`}>{label}</button>)}</div>
        <span className="text-xs font-semibold text-ink-500 dark:text-ink-400">{visible.length} registros</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-ink-100 bg-ink-50/70 text-left text-[10px] font-black uppercase tracking-[.1em] text-ink-500 dark:text-ink-400 dark:border-ink-800 dark:bg-ink-800/50"><tr><th className="px-4 py-3">Consulta</th><th>Resultado</th><th>Avaliação</th><th>Usuário</th><th>Data</th><th className="px-4 text-right">Ação</th></tr></thead>
          <tbody>
            {visible.map(item => (
              <tr key={item.id} className="border-b border-ink-100 align-top last:border-0 hover:bg-ink-50/70 dark:border-ink-800 dark:hover:bg-ink-800/40">
                <td className="px-4 py-3"><div className="max-w-[320px] font-semibold text-ink-800 dark:text-ink-100">{item.query}</div><div className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">PNC {item.pnc || 'não informado'}</div></td>
                <td className="py-3"><div className="font-mono text-xs font-black text-ink-900 dark:text-brand-300">{item.resultPart?.partNumber || '—'}</div><div className="mt-1 max-w-[250px] text-[11px] text-ink-500 dark:text-ink-400">{item.resultPart?.name || 'Peça indisponível'}</div>{item.correctedPart && <div className="mt-1 text-[11px] font-semibold text-brand-700 dark:text-brand-300">Correta: {item.correctedPart.partNumber} · {item.correctedPart.name}</div>}</td>
                <td className="py-3"><span className={`text-xs font-bold ${item.correct ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{item.correct ? 'Correto' : 'Incorreto'}</span>{!item.correct && <div className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">{item.reason ? reasonLabel[item.reason] || item.reason : 'Sem motivo'}</div>}</td>
                <td className="py-3 text-xs text-ink-500 dark:text-ink-400">{item.user?.email || 'Sistema'}</td>
                <td className="py-3 text-xs text-ink-500 dark:text-ink-400">{fmtDate(item.createdAt)}</td>
                <td className="px-4 py-3 text-right"><button type="button" disabled={deletingId === item.id} onClick={() => void deleteFeedback(item.id)} className="rounded-lg px-2.5 py-2 text-xs font-bold text-ink-500 dark:text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-950/30">{deletingId === item.id ? 'Excluindo…' : 'Excluir'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <div className="p-10 text-center text-sm text-ink-500 dark:text-ink-400">Carregando feedbacks…</div> : !visible.length ? <div className="p-10 text-center text-sm text-ink-500 dark:text-ink-400">Nenhum feedback neste filtro.</div> : null}
      </div>
    </section>
  );
}
