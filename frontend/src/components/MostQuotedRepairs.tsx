import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../lib';
import { formatBRL } from '../lib/quote-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type TopLine = { name: string; orders: number; percent: number; price: number | null; leadTime: string | null };

const PERIODS = [
  { value: '3', label: '3 meses' },
  { value: '12', label: '12 meses' },
  { value: 'all', label: 'Tudo' },
] as const;

/** Aceita só o formato esperado: resposta torta vira lista vazia, nunca derruba o painel do dono. */
function cleanTop(value: unknown): TopLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is TopLine => !!item && typeof item === 'object'
    && typeof (item as TopLine).name === 'string' && (item as TopLine).name !== ''
    && typeof (item as TopLine).orders === 'number' && typeof (item as TopLine).percent === 'number'
    && (typeof (item as TopLine).price === 'number' || (item as TopLine).price === null));
}

/**
 * O que mais se orça no conserto (as OS arquivadas, as importadas e as do balcão), para o dono guiar o estoque: peça, não serviço, com o valor de
 * referência e o prazo mais comum DO período escolhido. É consulta: nada aqui grava.
 */
export default function MostQuotedRepairs() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['value']>('12');
  const query = useQuery({
    queryKey: ['repair-top', period],
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const data = await apiJson<{ totalOrders?: number; items?: unknown }>(`/api/admin/repair-top?months=${period}&limit=30`, { timeoutMs: 25_000 });
      return { totalOrders: typeof data.totalOrders === 'number' ? data.totalOrders : 0, items: cleanTop(data.items) };
    },
  });

  // O painel do dono não pode travar por causa de uma lista secundária: sem resposta, o cartão simplesmente não aparece.
  if (query.error) return null;
  const items = query.data?.items ?? [];
  const totalOrders = query.data?.totalOrders ?? 0;

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">Mais orçadas no conserto</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {query.isLoading ? 'Carregando…' : `${totalOrders.toLocaleString('pt-BR')} OS no período`}
          </p>
        </div>
        <div role="group" aria-label="Período" className="flex gap-1">
          {PERIODS.map(item => (
            <button
              key={item.value}
              type="button"
              aria-pressed={period === item.value}
              onClick={() => setPeriod(item.value)}
              className={`h-9 rounded-md border px-3 text-base font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/60 ${period === item.value ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-300 dark:bg-brand-300 dark:text-brand-900' : 'border-border bg-background hover:bg-accent'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {items.length ? (
        <div className="max-h-104 overflow-y-auto focus-visible:outline-2 focus-visible:outline-ring" tabIndex={0} role="region" aria-label="Mais orçadas no conserto (rolagem)">
          <Table containerClassName="rounded-none border-0 bg-transparent">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Peça</TableHead>
                <TableHead className="text-right">OS</TableHead>
                <TableHead className="text-right">Das OS</TableHead>
                <TableHead className="text-right">Valor de referência</TableHead>
                <TableHead>Prazo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => (
                <TableRow key={item.name}>
                  <TableCell className="max-w-[22rem] truncate font-semibold text-foreground" title={item.name}>{item.name}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{item.orders.toLocaleString('pt-BR')}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.percent}%</TableCell>
                  <TableCell className="text-right tabular-nums">{item.price !== null ? formatBRL(item.price) : '—'}</TableCell>
                  <TableCell>{item.leadTime ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        !query.isLoading && <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhuma peça foi orçada mais de uma vez neste período.</div>
      )}
    </div>
  );
}
