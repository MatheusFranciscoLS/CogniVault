import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiJson, fmtDate } from '../lib';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Miss = { id: string; query: string; count: number; firstSeenAt: string; lastSeenAt: string };

const DAYS = 30;
const KEY = ['search-misses', DAYS];

/**
 * Buscas que o balcão fez e não acharam nada, da mais repetida para a menos (Negócio).
 *
 * É o que faltava saber: o histórico só guardava a busca que deu certo. Cada linha é uma peça, um código ou um modelo que alguém procurou e não
 * existe no catálogo, no cadastro de preços nem no Portal. Quando a loja cadastra a peça (ou a busca não faz sentido), "Dispensar" tira da lista;
 * se alguém procurar de novo, ela volta com a contagem zerada.
 */
export default function SearchMisses() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    staleTime: 60_000,
    queryFn: () => apiJson<{ total: number; items: Miss[] }>(`/api/admin/search-misses?days=${DAYS}&limit=50`, { timeoutMs: 25_000 }),
  });
  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const response = await api(`/api/admin/search-misses/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Não foi possível dispensar a busca.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['search-misses'] }),
    onError: error => toast.error(error instanceof Error ? error.message : 'Não foi possível dispensar a busca.'),
  });

  // O painel do dono não pode travar por causa de uma lista secundária: sem resposta, o cartão simplesmente não aparece.
  if (query.isLoading || query.error || !query.data) return null;
  const { total, items } = query.data;

  return (
    <section aria-label="Buscas sem resultado" className="overflow-hidden rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">Buscas sem resultado</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">O que o balcão procurou nos últimos {DAYS} dias e não achou no catálogo, no cadastro de preços nem no Portal.</p>
        </div>
        {total > 0 && <span className="text-sm text-muted-foreground">{total > items.length ? `${items.length} de ${total} buscas` : `${total} ${total === 1 ? 'busca' : 'buscas'}`}</span>}
      </div>
      {items.length ? (
        <Table containerClassName="rounded-none border-0 bg-transparent">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Busca</TableHead>
              <TableHead className="text-right">Vezes</TableHead>
              <TableHead className="text-right">Última</TableHead>
              <TableHead className="w-28"><span className="sr-only">Ação</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell translate="no" className="max-w-[28rem] truncate font-semibold" title={item.query}>{item.query}</TableCell>
                <TableCell className="text-right font-bold tabular-nums">{item.count}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{fmtDate(item.lastSeenAt)}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="ghost" size="sm" disabled={dismiss.isPending} aria-label={`Dispensar a busca ${item.query}`} onClick={() => dismiss.mutate(item.id)}>Dispensar</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhuma busca ficou sem resultado nos últimos {DAYS} dias.</div>
      )}
    </section>
  );
}
