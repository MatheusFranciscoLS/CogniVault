import { useEffect, useMemo, useState } from 'react';
import { api, fmtDate, json } from '../lib';
import type { AdminFeedback } from '../types';

const reasonLabel: Record<string, string> = {
  WRONG_CODE: 'Código incorreto',
  WRONG_PNC: 'PNC incorreto',
  WRONG_MODEL: 'Modelo incorreto',
  WRONG_PART: 'Peça incorreta',
  OTHER: 'Outro motivo',
  TREINAMENTO_INICIAL: 'Treinamento inicial de alto giro',
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
  }>({
    total: 0,
    uniqueSignals: 0,
    positive: 0,
    corrected: 0,
    negativeWithoutCorrection: 0,
    accuracy: null,
    reasons: {},
    learningLevel: 'COLD_START',
    nextMilestone: 5,
  });
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
    void (async () => {
      try {
        const data = await json<{ summary: typeof summary; feedback: AdminFeedback[] }>(await api('/api/admin/feedback'));
        if (active) {
          setSummary(data.summary);
          setItems(data.feedback);
        }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os feedbacks.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function seedKnowledge() {
    if (!window.confirm('Deseja inicializar o treinamento com as peças de alto giro (carburadores, velas, filtros, correias, sabres, pistões) encontradas nos seus catálogos?')) return;
    setSeeding(true);
    setError('');
    setNotice('');
    try {
      const res = await json<{ message: string; createdCount: number }>(await api('/api/admin/feedback/seed-knowledge', {
        method: 'POST',
      }));
      setNotice(res.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao inicializar treinamento.');
    } finally {
      setSeeding(false);
    }
  }

  async function deleteFeedback(id: string) {
    if (!window.confirm('Deseja excluir este registro de feedback?')) return;
    setDeletingId(id);
    setError('');
    setNotice('');
    try {
      await json<{ message: string }>(await api(`/api/admin/feedback/${id}`, {
        method: 'DELETE',
      }));
      setNotice('Feedback removido com sucesso.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir feedback.');
    } finally {
      setDeletingId(null);
    }
  }

  const visible = useMemo(
    () => items.filter((item) => filter === 'all' || (filter === 'positive' ? item.correct : !item.correct)),
    [items, filter],
  );
  const topReason = Object.entries(summary.reasons).sort((a, b) => b[1] - a[1])[0];
  const learningLabel = summary.learningLevel === 'ESTABLISHED' ? 'Base estabelecida' : summary.learningLevel === 'LEARNING' ? 'Aprendendo' : 'Primeiros sinais';

  return (
    <section>
      <div className="cv-page-heading">
        <div>
          <p className="cv-kicker">Aprendizado com o balcão</p>
          <h1 className="cv-page-title">Aprendizado da busca</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Veja o que a equipe já confirmou ou corrigiu e como esses sinais influenciam a ordem dos próximos resultados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={seeding || loading}
            onClick={() => void seedKnowledge()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-semibold shadow-sm transition disabled:opacity-50"
            title="Gera sinais verificados para peças essenciais dos modelos indexados"
          >
            <span>✦ {seeding ? 'Treinando IA…' : 'Treinar IA com Peças de Alto Giro'}</span>
          </button>
          <button type="button" disabled={loading} onClick={() => void load()} className="cv-secondary px-3 py-2 text-xs font-semibold">
            {loading ? 'Atualizando…' : 'Atualizar dados'}
          </button>
        </div>
      </div>

      <div className="rounded-[20px] border border-blue-200 dark:border-blue-600/80 bg-blue-50 dark:bg-[#123867]/70 p-4 text-xs leading-5 text-blue-950">
        <b>Como funciona:</b> “Sim” reforça o resultado para consultas parecidas; “Não” registra o erro e, quando uma correção é escolhida, favorece a peça certa. Isso ajusta o ranking interno de acordo com os catálogos oficiais.
      </div>

      {notice && (
        <div role="status" className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300 font-medium">
          {notice}
        </div>
      )}

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="cv-surface rounded-[22px] p-5">
          <div className="text-xs uppercase tracking-[.1em] text-slate-400">Sinais independentes</div>
          <div className="mt-2 text-3xl font-semibold">{loading ? '…' : summary.uniqueSignals}</div>
          <div className="mt-1 text-xs text-slate-400">{loading ? 'Conferindo avaliações' : `${summary.total} avaliações registradas`}</div>
        </div>
        <div className="cv-surface rounded-[22px] p-5">
          <div className="text-xs uppercase tracking-[.1em] text-slate-400">Confirmados</div>
          <div className="mt-2 text-3xl font-semibold text-emerald-700 dark:text-emerald-300">{loading ? '…' : summary.positive}</div>
          <div className="mt-1 text-xs text-slate-400">A equipe aprovou o resultado</div>
        </div>
        <div className="cv-surface rounded-[22px] p-5">
          <div className="text-xs uppercase tracking-[.1em] text-slate-400">Corrigidos</div>
          <div className="mt-2 text-3xl font-semibold text-blue-700 dark:text-blue-300">{loading ? '…' : summary.corrected}</div>
          <div className="mt-1 text-xs text-slate-400">Peça correta informada no “Não”</div>
        </div>
        <div className="cv-surface rounded-[22px] p-5">
          <div className="text-xs uppercase tracking-[.1em] text-slate-400">Estágio</div>
          <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{loading ? 'Carregando…' : learningLabel}</div>
          <div className="mt-1 text-xs text-slate-400">
            {loading ? 'Calculando consenso' : summary.nextMilestone ? `Próximo estágio com ${summary.nextMilestone} sinais` : 'Consenso já estabelecido'}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[18px] border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 px-4 py-3 text-xs leading-5 text-slate-600 dark:text-slate-400">
        Um voto isolado tem peso pequeno. Repetições do mesmo usuário não são contadas como novo consenso técnico; confirmações independentes e correções explícitas recebem mais peso, sempre com um limite seguro.{' '}
        {topReason ? `Motivo de erro mais frequente: ${reasonLabel[topReason[0]] || topReason[0]} (${topReason[1]}).` : ''}
      </div>

      <div className="cv-surface mt-5 rounded-[22px] p-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', 'Todos'],
              ['positive', 'Corretos'],
              ['negative', 'Incorretos'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                filter === id
                  ? 'bg-[#1d4f91] text-white'
                  : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 transition hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="cv-surface mt-4 overflow-hidden rounded-[22px]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-[11px] uppercase tracking-[.08em] text-slate-400">
              <tr>
                <th className="p-4">Consulta</th>
                <th>Resultado</th>
                <th>Avaliação</th>
                <th>Usuário</th>
                <th className="p-4">Data</th>
                <th className="p-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800/60 align-top transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="p-4">
                    <div className="max-w-[340px] font-medium text-slate-800 dark:text-slate-200">{item.query}</div>
                    <div className="mt-1 text-xs text-slate-400">PNC {item.pnc || 'não informado'}</div>
                  </td>
                  <td className="pt-4">
                    <div className="font-semibold text-slate-700 dark:text-slate-300">{item.resultPart?.partNumber || '—'}</div>
                    <div className="mt-1 text-xs text-slate-400">{item.resultPart?.name || 'Peça indisponível'}</div>
                    {item.correctedPart && (
                      <div className="mt-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-xs text-blue-700 dark:text-blue-300">
                        Correta: {item.correctedPart.partNumber} · {item.correctedPart.name}
                      </div>
                    )}
                  </td>
                  <td className="pt-4">
                    {item.correct ? (
                      <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Correto</span>
                    ) : (
                      <>
                        <span className="rounded-full bg-rose-50 dark:bg-rose-900/30 px-2 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300">Incorreto</span>
                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{item.reason ? reasonLabel[item.reason] || item.reason : 'Sem motivo informado'}</div>
                      </>
                    )}
                  </td>
                  <td className="pt-4 text-xs text-slate-500 dark:text-slate-400">{item.user?.email || 'Sistema'}</td>
                  <td className="p-4 text-xs text-slate-500 dark:text-slate-400">{fmtDate(item.createdAt)}</td>
                  <td className="p-4 text-right">
                    <button
                      type="button"
                      disabled={deletingId === item.id}
                      onClick={() => void deleteFeedback(item.id)}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-800/60 transition disabled:opacity-50"
                      title="Excluir este feedback de teste"
                    >
                      {deletingId === item.id ? 'Excluindo…' : 'Excluir'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-400">Carregando feedbacks salvos…</div>
          ) : !visible.length ? (
            <div className="p-10 text-center text-sm text-slate-400">Nenhum feedback neste filtro.</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
