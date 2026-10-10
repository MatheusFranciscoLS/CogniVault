import type { ReactNode } from 'react';

/** Mini-gráfico de linha (SVG puro, sem biblioteca): só para dar a tendência ao lado do número grande. */
export function Spark({ values, className }: { values: readonly number[]; className?: string }) {
  if (values.length < 2) return null;
  const width = 110;
  const height = 30;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * width},${height - 3 - ((value - min) / (max - min || 1)) * (height - 8)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className={className}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Um número grande da faixa: rótulo pequeno, valor, e uma linha de apoio (com tendência opcional à direita). Texto claro sobre o marinho. */
export default function BandStat({ label, value, caption, aside }: { label: string; value: ReactNode; caption?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="min-w-0 border-l border-white/15 px-6 first:border-l-0 first:pl-0">
      <div className="text-sm font-semibold uppercase tracking-wider text-band-muted">{label}</div>
      <div className="mt-1 whitespace-nowrap text-[2.25rem] font-extrabold leading-[1.05] tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 flex items-end justify-between gap-2 text-sm text-band-muted">
        <span className="min-w-0">{caption}</span>
        {aside}
      </div>
    </div>
  );
}
