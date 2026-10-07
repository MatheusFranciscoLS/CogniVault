import { Fragment, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, TrendingDown, TrendingUp, X } from 'lucide-react';
import { useMachineList } from '../lib/use-machine-list';
import { formatBRL } from '../lib/quote-message';
import {
  EMPTY_FILTERS,
  applicationLabel,
  categoryLabel,
  countNews,
  facetCounts,
  matchesFilters,
  priceChange,
  sortMachines,
  technologyLabel,
  type ListedMachine,
  type MachineFilters,
  type MachineSort,
} from '../lib/machine-list';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import AdminPage from './admin/AdminPage';
import MachineListDetail from './MachineListDetail';

const selectClass =
  'h-10 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/60';

export function MachineBadges({ machine }: { machine: ListedMachine }) {
  return (
    <>
      {machine.isNew && <span className="inline-flex items-center rounded-md bg-ok-soft px-2 py-0.5 text-sm font-medium text-ok">Nova</span>}
      {machine.discontinued && <span className="inline-flex items-center rounded-md bg-warn-soft px-2 py-0.5 text-sm font-medium text-warn">Descontinuada</span>}
    </>
  );
}

/** Preço da lista, com o preço anterior logo abaixo quando mudou nesta lista. */
export function MachinePrice({ machine, className }: { machine: ListedMachine; className?: string }) {
  const change = priceChange(machine);
  return (
    <div className={cn('text-right', className)}>
      <div className="font-code text-lg font-semibold tabular-nums text-foreground">{formatBRL(machine.listPrice)}</div>
      {change && (
        <div className={cn('flex items-center justify-end gap-1 text-sm tabular-nums', change.direction === 'down' ? 'text-ok' : 'text-warn')}>
          {change.direction === 'down' ? <TrendingDown className="size-4" aria-hidden="true" /> : <TrendingUp className="size-4" aria-hidden="true" />}
          <span>{change.direction === 'down' ? 'Baixou de' : 'Subiu de'} {formatBRL(change.before)}</span>
        </div>
      )}
    </div>
  );
}

function SortHeader({ label, active, direction, onClick, align = 'left' }: { label: string; active: boolean; direction?: 'asc' | 'desc'; onClick: () => void; align?: 'left' | 'right' }) {
  const Icon = !active ? ArrowUpDown : direction === 'desc' ? ArrowDown : ArrowUp;
  return (
    <th scope="col" aria-sort={active ? (direction === 'desc' ? 'descending' : 'ascending') : 'none'} className={cn('px-4 py-2 font-medium', align === 'right' ? 'text-right' : 'text-left')}>
      <button
        type="button"
        onClick={onClick}
        className={cn('-my-1 inline-flex h-8 items-center gap-1.5 rounded-md px-2 outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60', active && 'text-foreground')}
      >
        {label}
        <Icon className="size-4" aria-hidden="true" />
      </button>
    </th>
  );
}

function formatListDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export default function MachineListPanel({ onOpenMachine }: { onOpenMachine: (pnc: string) => void }) {
  const [filters, setFilters] = useState<MachineFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<MachineSort>('category');
  const [selected, setSelected] = useState<ListedMachine | null>(null);

  const query = useMachineList();

  const machines = useMemo(() => query.data?.machines ?? [], [query.data]);
  const visible = useMemo(() => sortMachines(machines.filter(machine => matchesFilters(machine, filters)), sort), [machines, filters, sort]);
  const technologies = useMemo(() => facetCounts(machines, filters, 'technology'), [machines, filters]);
  const categories = useMemo(() => facetCounts(machines, filters, 'category'), [machines, filters]);
  const applications = useMemo(() => facetCounts(machines, filters, 'application'), [machines, filters]);
  const news = useMemo(() => countNews(machines), [machines]);

  const hasFilter = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const update = (patch: Partial<MachineFilters>) => setFilters(current => ({ ...current, ...patch }));
  const listDate = formatListDate(query.data?.listDate ?? null);

  const toggleModelSort = () => setSort(current => (current === 'model' ? 'category' : 'model'));
  const togglePriceSort = () => setSort(current => (current === 'price-asc' ? 'price-desc' : 'price-asc'));

  return (
    <AdminPage
      title="Tabela de preços"
      action={listDate ? <p className="text-base text-muted-foreground">Lista de {listDate}</p> : undefined}
    >
      {query.isLoading && (
        <div aria-busy="true" className="space-y-2">
          <Skeleton className="h-10 w-full max-w-md" />
          {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-14 w-full" />)}
        </div>
      )}

      {query.error && (
        <p role="alert" className="rounded-lg border border-warn bg-warn-soft px-4 py-3 text-base text-warn">
          Não foi possível carregar a tabela de preços.{' '}
          <button type="button" className="font-semibold underline" onClick={() => void query.refetch()}>Tentar de novo</button>
        </p>
      )}

      {!query.isLoading && !query.error && machines.length === 0 && (
        <p className="rounded-lg border border-border bg-card px-4 py-10 text-center text-base text-muted-foreground">
          A tabela de preços ainda não foi carregada.
        </p>
      )}

      {machines.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                autoFocus
                value={filters.text}
                onChange={event => update({ text: event.target.value })}
                placeholder="Modelo, PNC ou descrição"
                aria-label="Buscar máquina na tabela"
                className="h-10 pl-10 text-base"
              />
            </div>

            <div role="group" aria-label="Tecnologia" className="inline-flex overflow-hidden rounded-md border border-input bg-card">
              {[{ value: '', label: 'Todas', count: null as number | null }, ...technologies.map(item => ({ value: item.value, label: technologyLabel(item.value), count: item.count as number | null }))].map(option => (
                <button
                  key={option.value || 'all'}
                  type="button"
                  aria-pressed={filters.technology === option.value}
                  onClick={() => update({ technology: option.value, category: '' })}
                  className={cn(
                    'h-10 border-r border-input px-3 text-base outline-none transition-colors last:border-r-0 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/60',
                    filters.technology === option.value ? 'bg-selected font-semibold text-foreground' : 'text-foreground hover:bg-accent',
                  )}
                >
                  {option.label}{option.count !== null && <span className="ml-1.5 tabular-nums opacity-100">{option.count}</span>}
                </button>
              ))}
            </div>

            <select aria-label="Categoria" value={filters.category} onChange={event => update({ category: event.target.value })} className={selectClass}>
              <option value="">Todas as categorias</option>
              {categories.map(item => <option key={item.value} value={item.value}>{categoryLabel(item.value)} ({item.count})</option>)}
            </select>

            <select aria-label="Aplicação" value={filters.application} onChange={event => update({ application: event.target.value })} className={selectClass}>
              <option value="">Qualquer aplicação</option>
              {applications.map(item => <option key={item.value} value={item.value}>{applicationLabel(item.value)} ({item.count})</option>)}
            </select>

            {news > 0 && (
              <Button variant="outline" className={filters.onlyNews ? 'border-ring bg-selected font-semibold' : undefined} aria-pressed={filters.onlyNews} onClick={() => update({ onlyNews: !filters.onlyNews })}>
                Novidades da lista ({news})
              </Button>
            )}

            {hasFilter && (
              <Button variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
                <X className="size-4" aria-hidden="true" /> Limpar
              </Button>
            )}

            <p aria-live="polite" className="ml-auto text-base text-muted-foreground tabular-nums">
              {visible.length} {visible.length === 1 ? 'máquina' : 'máquinas'}
            </p>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-lg border border-border bg-card px-4 py-10 text-center text-base text-muted-foreground">
              Nenhuma máquina com esses filtros.{' '}
              <button type="button" className="font-semibold text-primary underline" onClick={() => setFilters(EMPTY_FILTERS)}>Limpar filtros</button>
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <table className="w-full border-collapse text-base">
                <thead className="border-b border-border bg-muted text-sm text-muted-foreground">
                  <tr>
                    <SortHeader label="Modelo" active={sort === 'model'} direction="asc" onClick={toggleModelSort} />
                    <th scope="col" className="px-4 py-2 text-left font-medium">PNC</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">Aplicação</th>
                    <SortHeader label="Preço da lista" active={sort === 'price-asc' || sort === 'price-desc'} direction={sort === 'price-desc' ? 'desc' : 'asc'} onClick={togglePriceSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((machine, index) => {
                    const startsGroup = sort === 'category' && (index === 0 || visible[index - 1].category !== machine.category);
                    return (
                      <Fragment key={machine.pnc}>
                        {startsGroup && (
                          <tr className="bg-secondary">
                            <th colSpan={4} scope="colgroup" className="px-4 py-1.5 text-left text-base font-semibold text-foreground">
                              {categoryLabel(machine.category)}
                            </th>
                          </tr>
                        )}
                        <tr
                          onClick={() => setSelected(machine)}
                          className="cursor-pointer border-t border-border transition-colors hover:bg-accent"
                        >
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              onClick={event => { event.stopPropagation(); setSelected(machine); }}
                              className="block w-full rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
                            >
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-lg font-semibold text-foreground">{machine.model}</span>
                                <MachineBadges machine={machine} />
                              </span>
                              <span className="block text-base text-muted-foreground">{machine.description}</span>
                            </button>
                          </td>
                          <td className="px-4 py-2.5 font-code tabular-nums text-muted-foreground" translate="no">{machine.pnc}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{applicationLabel(machine.application)}</td>
                          <td className="px-4 py-2.5"><MachinePrice machine={machine} /></td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selected && (
        <MachineListDetail
          machine={selected}
          onClose={() => setSelected(null)}
          onOpenMachine={pnc => { setSelected(null); onOpenMachine(pnc); }}
        />
      )}
    </AdminPage>
  );
}
