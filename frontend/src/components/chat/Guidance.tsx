import type { ChatResponse } from '../../types';

export default function Guidance({ response }: { response: ChatResponse }) {
  if (!response.guidance) return null;
  const palette = response.status === 'FOUND'
    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
    : response.status === 'NOT_FOUND'
      ? 'border-rose-200 bg-rose-50/70 text-rose-950'
      : 'border-amber-200 bg-amber-50/70 text-amber-950';

  return (
    <div className={`rounded-2xl border p-3.5 ${palette}`}>
      <div className="text-xs font-bold">{response.guidance.title}</div>
      <div className="mt-1 text-xs leading-5 opacity-75">{response.guidance.description}</div>
      {response.guidance.tips.length ? (
        <ul className="mt-2 space-y-1 text-[11px] opacity-75">
          {response.guidance.tips.map(tip => <li key={tip}>• {tip}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
