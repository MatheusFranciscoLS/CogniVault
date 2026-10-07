import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Uma peça dentro de uma vista explodida (Husqvarna, Briggs, Kawasaki): posição, nome,
 * CÓDIGO copiável com um clique, preço e "+ Orçamento". Igual nas três marcas para o balcão
 * ler tudo do mesmo jeito.
 *
 * `code` é o que vai para a área de transferência (e para o Clipp); `displayCode` é como
 * aparece na tela. A máscara da etiqueta Husqvarna ("587 10 67-01") NÃO serve para Briggs
 * nem Kawasaki ("15004-0937" sem o hífen não é código de nada), por isso quem chama decide.
 */

export type PartLineProps = {
  position?: string | null;
  name: string;
  code: string;
  displayCode?: string;
  price?: number | null;
  /** Substitui o preço quando a origem é outra (cadastro da loja com prateleira e aviso de preço velho). */
  priceSlot?: ReactNode;
  quantity?: number | null;
  imageUrl?: string | null;
  /** Etiquetas curtas ao lado do nome (fora de linha, code date, só em kit). */
  badges?: ReactNode;
  /** Observações que mudam a venda: serial, outra variante, pacote fechado, motor. */
  notes?: ReactNode;
  replaces?: string[];
  selected?: boolean;
  highlighted?: boolean;
  inCart: number;
  onToggleSelect?: () => void;
  onCopy: () => void;
  onAdd: () => void;
  menu?: Array<{ label: string; onSelect: () => void }>;
  anchorId?: string;
};

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function Note({ tone = 'muted', children }: { tone?: 'muted' | 'warn'; children: ReactNode }) {
  return (
    <p className={cn('mt-2 rounded-md px-3 py-2 text-sm', tone === 'warn' ? 'border border-warn bg-warn-soft text-warn' : 'bg-secondary text-muted-foreground')}>{children}</p>
  );
}

export default function PartLine({ position, name, code, displayCode, price, priceSlot, quantity, imageUrl, badges, notes, replaces, selected, highlighted, inCart, onToggleSelect, onCopy, onAdd, menu = [], anchorId }: PartLineProps) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    onCopy();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const shown = displayCode || code;

  return (
    <article
      id={anchorId}
      className={cn(
        'flex gap-3 rounded-lg border bg-card px-4 py-3 transition-colors',
        highlighted ? 'border-primary ring-2 ring-primary/30' : selected ? 'border-ring bg-selected' : 'border-border hover:bg-muted',
      )}
    >
      {onToggleSelect && code && (
        <input
          type="checkbox"
          checked={Boolean(selected)}
          onChange={onToggleSelect}
          aria-label={`Selecionar ${name}`}
          className="mt-1.5 size-5 shrink-0 cursor-pointer accent-[var(--primary)]"
        />
      )}
      {imageUrl && <img src={imageUrl} alt="" className="size-14 shrink-0 rounded-md border border-border bg-white object-contain p-0.5" loading="lazy" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {position && <span className="mt-0.5 grid h-7 min-w-7 shrink-0 place-items-center rounded-md bg-secondary px-1.5 font-code text-base font-semibold tabular-nums" title="Posição na vista explodida">{position}</span>}
          <h4 className="min-w-0 flex-1 text-[17px] font-semibold leading-7">{name}</h4>
          {badges}
          {quantity && quantity > 1 ? <span className="shrink-0 rounded-md bg-warn-soft px-2 py-0.5 text-sm font-semibold text-warn" title="Quantidade que o conjunto leva">leva {quantity}</span> : quantity ? <span className="shrink-0 text-sm text-muted-foreground">Qtd. {quantity}</span> : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
          {code ? (
            <button
              type="button"
              onClick={copy}
              aria-label={`Copiar código ${shown}`}
              title="Copiar código"
              className="group/copy -ml-1 flex items-center gap-2 rounded-md px-1 py-0.5 outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/60"
            >
              <span translate="no" className="font-code text-[22px] font-semibold leading-7 tracking-wide tabular-nums">{shown}</span>
              {copied ? <Check className="size-4 text-ok" aria-hidden="true" /> : <Copy className="size-4 text-muted-foreground group-hover/copy:text-foreground" aria-hidden="true" />}
            </button>
          ) : (
            <span className="text-sm text-muted-foreground">Sem código nesta vista</span>
          )}
          {priceSlot ?? (price != null ? (
            <span className="font-code text-xl font-bold tabular-nums">{brl.format(price)}</span>
          ) : code ? (
            <span className="text-sm text-muted-foreground">Sem preço</span>
          ) : null)}
          {code && (
            <div className="ml-auto flex items-center gap-1">
              <Button variant={inCart > 0 ? 'added' : 'add'} onClick={onAdd}>
                {inCart > 0 ? <><Check className="size-4" />No orçamento · {inCart}</> : '+ Orçamento'}
                <span className="sr-only">, {name}</span>
              </Button>
              {menu.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Mais ações para ${name}`}>
                      <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    {menu.map(item => <DropdownMenuItem key={item.label} onSelect={item.onSelect} className="h-10 text-base">{item.label}</DropdownMenuItem>)}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>

        {replaces && replaces.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">Substitui <span translate="no" className="font-code tabular-nums">{replaces.join(', ')}</span></p>
        )}
        {notes}
      </div>
    </article>
  );
}
