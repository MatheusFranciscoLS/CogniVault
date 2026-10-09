import type { QuoteSyncState } from '../context/QuoteCartContext';
import { cn } from '@/lib/utils';

/**
 * Onde o orçamento está guardado. O atendente precisa dessa informação na tela:
 * "Só neste aparelho" significa que trocar de aparelho agora perderia o orçamento.
 * Discreto quando está tudo certo, em destaque quando não está.
 */
export default function SyncStatus({ state }: { state: QuoteSyncState }) {
  const config: Record<QuoteSyncState, { label: string; dot: string; title: string }> = {
    loading: { label: 'Carregando…', dot: 'bg-muted-foreground', title: 'Buscando o orçamento salvo no servidor.' },
    saving: { label: 'Salvando…', dot: 'bg-muted-foreground', title: 'Gravando o orçamento no servidor.' },
    synced: { label: 'No servidor', dot: 'bg-ok', title: 'Este orçamento está salvo no servidor e abre em qualquer aparelho.' },
    offline: { label: 'Só neste aparelho', dot: 'bg-warn', title: 'Sem conexão com o servidor. O orçamento está apenas neste navegador: não troque de aparelho até voltar.' },
  };
  const { label, dot, title } = config[state];
  return (
    <span title={title} className={cn('inline-flex items-center gap-1.5 text-sm', state === 'offline' ? 'font-semibold text-warn' : 'text-muted-foreground')}>
      <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />
      {label}
    </span>
  );
}
