import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type PageTab<T extends string> = { id: T; label: string; badge?: number };

/**
 * Abas em pílula que ficam sobre a borda de baixo da faixa (direção B). É estado da tela, não endereço: trocar de aba não recarrega nem muda a URL.
 * Setas esquerda/direita percorrem as abas (padrão de tablist), e o laranja do selo só aparece quando há algo que precisa do dono.
 */
export default function PageTabs<T extends string>({ tabs, value, onChange, label }: { tabs: readonly PageTab<T>[]; value: T; onChange: (id: T) => void; label: string }): ReactNode {
  const move = (index: number, step: number) => {
    const next = tabs[(index + step + tabs.length) % tabs.length];
    onChange(next.id);
    requestAnimationFrame(() => document.getElementById(`tab-${next.id}`)?.focus());
  };
  return (
    <div role="tablist" aria-label={label} className="relative z-10 inline-flex gap-1 rounded-xl border border-border bg-card p-1 shadow-card">
      {tabs.map((tab, index) => {
        const on = tab.id === value;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={on}
            aria-controls={`painel-${tab.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={event => {
              if (event.key === 'ArrowRight') { event.preventDefault(); move(index, 1); }
              else if (event.key === 'ArrowLeft') { event.preventDefault(); move(index, -1); }
            }}
            className={cn(
              'flex h-10 items-center gap-2 rounded-lg px-5 text-base font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60',
              on ? 'bg-bar text-bar-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.badge ? <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-sm font-bold tabular-nums text-primary-foreground">{tab.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
