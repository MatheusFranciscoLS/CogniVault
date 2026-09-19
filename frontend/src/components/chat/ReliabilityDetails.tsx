import type { ChatResponse, RetrievalSource } from '../../types';

const retrievalLabels: Record<RetrievalSource, string> = {
  DIRECT_CODE: 'Código exato',
  SEMANTIC: 'Semântica',
  LEXICAL: 'Vocabulário técnico',
  FULL_TEXT: 'Texto do catálogo',
  FUZZY: 'Tolerância a digitação',
};

export default function ReliabilityDetails({ response }: { response: ChatResponse }) {
  const evidence = response.match?.evidence || [];
  const sources = response.match?.retrievalSources || [];
  const context = response.technicalContext || [];
  if (!evidence.length && !sources.length && !context.length) return null;

  return (
    <details open={response.match?.level === 'REVIEW'} className="mt-3 rounded-xl border border-brand-100 dark:border-brand-700 bg-brand-50 dark:bg-ink-900/40 p-3 text-xs text-ink-600 dark:text-ink-400">
      <summary className="cursor-pointer font-semibold text-brand-700">Evidências da decisão</summary>
      {sources.length ? (
        <div className="mt-3">
          <div className="text-[10px] font-bold uppercase tracking-[.1em] text-ink-500 dark:text-ink-400">Métodos que encontraram a peça</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sources.map(source => <span key={source} className="rounded-full bg-white dark:bg-ink-800 px-2.5 py-1 text-[10px] font-semibold text-brand-600 dark:text-brand-300 ring-1 ring-brand-100">{retrievalLabels[source as RetrievalSource]}</span>)}
          </div>
        </div>
      ) : null}
      {evidence.length ? (
        <ul className="mt-3 space-y-1.5 leading-5 text-ink-600 dark:text-ink-400">
          {evidence.map((item, index) => <li key={`${item}-${index}`}>• {item}</li>)}
        </ul>
      ) : null}
      {context.length ? (
        <div className="mt-3 border-t border-brand-100 dark:border-brand-700 pt-3">
          <div className="text-[10px] font-bold uppercase tracking-[.1em] text-ink-500 dark:text-ink-400">Memória técnica da mesma fonte</div>
          <p className="mt-1 text-[10px] leading-4 text-ink-500 dark:text-ink-400">Estes trechos servem para conferir contexto mecânico. O Part Number não é extraído deles; o código exibido vem do registro estruturado da peça.</p>
          <div className="mt-2 grid gap-2">
            {context.map((item, index) => (
              <div key={`${item.filename}-${item.page}-${item.section}-${index}`} className="rounded-lg border border-brand-100 dark:border-brand-700 bg-white dark:bg-ink-800 p-2.5">
                <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] font-semibold text-brand-700">
                  <span>{item.filename}</span>
                  {item.page ? <span>pág. {item.page}</span> : null}
                  {item.section ? <span>vista {item.section}</span> : null}
                </div>
                <div className="mt-1 line-clamp-4 whitespace-pre-line text-[10px] leading-4 text-ink-500 dark:text-ink-400">{item.excerpt}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </details>
  );
}
