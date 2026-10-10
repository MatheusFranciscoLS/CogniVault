import { useEnginePartsWithoutPriceData } from '../lib/admin-queries';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const BRAND: Record<string, string> = { BRIGGS: 'Briggs', KAWASAKI: 'Kawasaki', KOHLER: 'Kohler' };

/**
 * Peças de motor que o balcão já abriu no catálogo do fabricante e que a loja não tem com preço.
 *
 * É demanda real (alguém abriu aquele motor com um cliente na frente), e é o que o atendente vê como "sem preço". Ordenada pela peça que serve a mais
 * motores, que é a que mais compensa cadastrar. Não depende do período do painel: o índice de peças lidas é acumulado.
 */
export default function EnginePartsWithoutPrice() {
  const query = useEnginePartsWithoutPriceData();

  if (query.isLoading) return null;
  // O painel do dono não pode travar por causa de uma lista secundária: sem resposta, o cartão simplesmente não aparece.
  if (query.error || !query.data) return null;
  const { total, items } = query.data;

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">Peças de motor consultadas sem preço</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Abertas nos catálogos de Briggs, Kawasaki e Kohler e fora da lista de preços da loja.</p>
        </div>
        {total > 0 && <span className="text-sm text-muted-foreground">{total > items.length ? `${items.length} de ${total} peças` : `${total} ${total === 1 ? 'peça' : 'peças'}`}</span>}
      </div>
      {items.length ? (
        <div className="max-h-104 overflow-y-auto focus-visible:outline-2 focus-visible:outline-ring" tabIndex={0} role="region" aria-label="Peças de motor consultadas sem preço (rolagem)">
          <Table containerClassName="rounded-none border-0 bg-transparent">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Peça</TableHead>
                <TableHead className="text-right">Motores</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => (
                <TableRow key={item.partNumber}>
                  <TableCell className="max-w-[22rem]">
                    <div className="truncate font-semibold text-foreground" title={item.name}>{item.name}</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span translate="no" className="font-mono text-sm font-bold text-brand-600 dark:text-brand-300">{item.partNumber}</span>
                      {item.sources.map(source => <span key={source} className="rounded-sm bg-muted px-1.5 text-sm font-semibold text-muted-foreground">{BRAND[source] ?? source}</span>)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="font-bold tabular-nums">{item.engines}</div>
                    <div translate="no" className="text-sm text-muted-foreground">{item.engineExamples.join(' · ')}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhuma peça de motor consultada está sem preço.</div>
      )}
    </div>
  );
}
