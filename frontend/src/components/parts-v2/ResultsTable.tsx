import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { PART_ROW_GRID } from './PartRow';
import { cn } from '@/lib/utils';

/** Tabela de resultados: cabeçalho de colunas e grupos em régua, não pilha de cartões. */
export function ResultsTable({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Resultados" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className={cn('hidden h-10 items-center gap-x-4 border-b border-border bg-muted px-4 text-sm font-semibold text-muted-foreground lg:grid', PART_ROW_GRID)}>
        <span>Código</span>
        <span>Peça</span>
        <span className="text-right">Preço</span>
        <span />
        <span />
      </div>
      {children}
    </section>
  );
}

/** Título de um grupo de linhas (ex.: "No catálogo", "No cadastro de preços"). */
export function ResultsGroup({ title, count, aside, showHeader = true, children }: { title: string; count?: string; aside?: ReactNode; showHeader?: boolean; children: ReactNode }) {
  if (!showHeader) return <div>{children}</div>;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          {count && <span className="text-sm text-muted-foreground">{count}</span>}
        </div>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** Carregamento: linhas cinza no lugar das peças, para o balcão ver que algo vem vindo. */
export function ResultsSkeleton() {
  return (
    <ResultsTable>
      <span role="status" className="sr-only">Buscando…</span>
      {[0, 1, 2, 3].map(item => (
        <div key={item} className={cn('grid items-center gap-x-4 gap-y-2 border-b border-border px-4 py-4 last:border-b-0', PART_ROW_GRID)} aria-hidden="true">
          <Skeleton className="h-6 w-32" />
          <div className="space-y-2"><Skeleton className="h-5 w-3/5" /><Skeleton className="h-4 w-2/5" /></div>
          <Skeleton className="h-7 w-24 lg:ml-auto" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="size-10 justify-self-end" />
        </div>
      ))}
    </ResultsTable>
  );
}
