import { Plus } from 'lucide-react';
import { formatBRL } from '../lib/quote-message';
import { suggestionDetail, type HistorySuggestion, type TogetherSuggestion } from '../lib/use-repair-history';

/**
 * Linhas parecidas que já foram orçadas, abertas para CIMA da linha de entrada (que fica no pé da tela). É sugestão, nunca obrigação: o texto
 * digitado vale sempre, Enter sem opção marcada lança o que foi digitado, e Esc fecha.
 */
export function SuggestionList({ id, items, active, onPick }: { id: string; items: HistorySuggestion[]; active: number; onPick: (item: HistorySuggestion) => void }) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Já orçado antes"
      className="absolute bottom-full left-[10.75rem] z-30 mb-1 max-h-72 w-[min(640px,calc(100%_-_10.75rem))] overflow-y-auto rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-lg"
    >
      {items.map((item, index) => (
        <li
          key={`${item.name}-${index}`}
          id={`${id}-${index}`}
          role="option"
          aria-selected={index === active}
          // mouseDown (e não click): o campo não perde o foco antes de escolher
          onMouseDown={event => { event.preventDefault(); onPick(item); }}
          className={`flex cursor-pointer items-baseline justify-between gap-4 px-3 py-1.5 text-base ${index === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`}
        >
          <span className="min-w-0 truncate font-medium">{item.name}</span>
          <span className="shrink-0 font-code text-sm tabular-nums text-muted-foreground">{suggestionDetail(item)}</span>
        </li>
      ))}
    </ul>
  );
}

/** "Costuma levar junto": atalhos para lançar com um clique o que as OS parecidas costumam ter, com o valor de referência. */
export function TogetherChips({ items, onAdd }: { items: TogetherSuggestion[]; onAdd: (item: TogetherSuggestion) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Costuma levar junto">
      <span className="text-sm font-medium text-muted-foreground">Costuma levar junto</span>
      {items.slice(0, 5).map(item => (
        <button
          key={item.name}
          type="button"
          onClick={() => onAdd(item)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {item.name}
          <span className="font-code text-xs tabular-nums text-muted-foreground">{item.price !== null ? formatBRL(item.price) : `${item.percent}%`}</span>
        </button>
      ))}
    </div>
  );
}
