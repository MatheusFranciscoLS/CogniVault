import type { ChatResponse } from '../../types';

export default function Interpretation({ response }: { response: ChatResponse }) {
  if (!response.interpreted) return null;
  const entries = [
    response.interpreted.partDescription ? ['Peça', response.interpreted.partDescription] : null,
    response.interpreted.manufacturer ? ['Fabricante', response.interpreted.manufacturer] : null,
    response.interpreted.model ? ['Modelo', response.interpreted.model] : null,
    response.interpreted.pnc ? ['PNC', response.interpreted.pnc] : null,
    response.interpreted.partNumber ? ['Código', response.interpreted.partNumber] : null,
  ].filter((entry): entry is string[] => Boolean(entry));

  if (!entries.length) return null;
  return (
    <details className="mt-3 rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800/70 p-3 text-xs text-ink-600 dark:text-ink-400">
      <summary className="cursor-pointer font-semibold text-ink-700 dark:text-ink-300">O que o assistente entendeu</summary>
      <div className="mt-2 flex flex-wrap gap-2">
        {entries.map(([label, value]) => <span key={`${label}-${value}`} className="rounded-full bg-ink-100 dark:bg-ink-700 px-2.5 py-1"><b>{label}:</b> {value}</span>)}
      </div>
    </details>
  );
}
