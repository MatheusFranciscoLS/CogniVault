import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { apiJson } from '../lib';
import { formatBRL } from '../lib/quote-message';
import { storeDayKey } from '../lib/quote-days';
import { useQuoteCart, type SavedQuote } from '../context/QuoteCartContext';
import { Input } from '@/components/ui/input';
import PageFrame from './PageFrame';
import QuickQuoteCart from './QuickQuoteCart';
import RepairImport from './RepairImport';
import { toSavedQuote, type ApiQuoteListItem } from '../lib/saved-quote-api';

const FOLDER_SIZE = 30;

/** "Hoje" ou dd/mm (a pasta é estreita: o nome do dia por extenso não cabe). */
function shortDay(key: string, todayKey: string): string {
  if (key === todayKey) return 'Hoje';
  const [, month, day] = key.split('-');
  return `${day}/${month}`;
}

/** Espera o balcão parar de digitar antes de buscar na pasta. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * A "pasta" dos orçamentos de conserto: um por número de OS (o que a loja guarda hoje como "ORÇAMENTO DAV 59600.xlsx"). Abrir um traz o
 * orçamento de volta para edição; salvar de novo o mesmo número atualiza o mesmo (o servidor não cria cópia).
 */
function RepairFolder({ onOpen, admin }: { onOpen: (quote: SavedQuote) => void; admin: boolean }) {
  const [text, setText] = useState('');
  const search = useDebounced(text.trim(), 350);
  const [state, setState] = useState<{ key: string; quotes: ApiQuoteListItem[]; total: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const { syncState, items, savedQuotes } = useQuoteCart();
  // Depois de enviar um orçamento (o servidor guarda e `savedQuotes` muda), a pasta se atualiza sozinha.
  const refreshKey = `${search}|${syncState}|${items.length}|${reload}`;

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ kind: 'REPAIR', take: String(FOLDER_SIZE) });
    if (search) params.set('q', search);
    void apiJson<{ quotes: ApiQuoteListItem[]; total: number }>(`/api/quotes?${params.toString()}`)
      .then(data => { if (active) { setState({ key: refreshKey, quotes: data.quotes, total: data.total }); setFailed(null); } })
      .catch(error => { if (active) setFailed(error instanceof Error ? error.message : 'Não foi possível abrir a pasta.'); });
    return () => { active = false; };
    // `refreshKey` já contém a busca; ele é a única dependência de recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, savedQuotes]);

  const today = storeDayKey(new Date());
  return (
    <aside aria-label="Pasta de orçamentos de conserto" className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Pasta</h2>
        {admin && <RepairImport onFinished={() => setReload(value => value + 1)} />}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={text}
          onChange={event => setText(event.target.value)}
          aria-label="Buscar na pasta de conserto"
          placeholder="Nº da OS ou cliente"
          autoComplete="off"
          spellCheck={false}
          className="pl-9 text-base"
        />
      </div>
      {failed ? (
        <p role="status" className="text-sm text-warn">{failed}</p>
      ) : !state ? (
        <p role="status" className="text-sm text-muted-foreground">Abrindo a pasta…</p>
      ) : state.quotes.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">{search ? 'Nenhum orçamento com esse número ou cliente.' : 'Nenhum orçamento de conserto ainda.'}</p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {state.quotes.map(quote => {
              const when = quote.savedAt || quote.createdAt;
              return (
                <li key={quote.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(toSavedQuote(quote))}
                    aria-label={`Abrir o orçamento ${quote.docNumber ? `da OS ${quote.docNumber}` : 'sem número'}${quote.customerName ? ` de ${quote.customerName}` : ''}`}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-2.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-code text-lg font-semibold tabular-nums">{quote.docNumber ? `OS ${quote.docNumber}` : 'Sem número'}</span>
                      <span className="block truncate text-sm text-muted-foreground">{quote.customerName || 'Cliente não informado'} · {shortDay(storeDayKey(new Date(when)), today)}</span>
                    </span>
                    <span className="shrink-0 font-code text-base font-semibold tabular-nums">{formatBRL(quote.netTotal ?? quote.grossTotal)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {state.total > state.quotes.length && <p className="text-sm text-muted-foreground">{state.quotes.length} de {state.total}. Digite o número para achar o resto.</p>}
        </>
      )}
    </aside>
  );
}

/**
 * A aba Conserto: a MESMA cesta do orçamento, em página inteira e no modo conserto (peças de qualquer fornecedor e mão de obra, "Nº da OS" em
 * branco para o balcão digitar, sem "Peças originais" nos textos), ao lado da pasta dos orçamentos já feitos. Com a cesta vazia ela já é
 * conserto; com um orçamento de peças em andamento ele continua de peças (o seletor do cabeçalho converte), nunca por engano.
 */
export default function RepairQuotePage({ admin = false }: { admin?: boolean }) {
  const { restoreQuote, setIsOpen } = useQuoteCart();
  const open = (quote: SavedQuote) => {
    restoreQuote({ ...quote, kind: 'REPAIR' });
    setIsOpen(false);
  };

  return (
    <PageFrame title="Conserto">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <QuickQuoteCart layout="page" />
        <RepairFolder onOpen={open} admin={admin} />
      </div>
    </PageFrame>
  );
}
