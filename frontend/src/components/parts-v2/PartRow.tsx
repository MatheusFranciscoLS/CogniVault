import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Linha de resultado da busca. Uma só para as duas origens (catálogo técnico e
 * cadastro comercial), para o balcão ler tudo do mesmo jeito.
 *
 * A linha mostra o que decide a venda: CÓDIGO, nome, onde a peça serve, PREÇO e o botão.
 * O resto (posição na vista, "onde usa", conferir na fonte oficial) abre na gaveta ou
 * no menu "⋯". O código é a única coisa que vira "etiqueta" (condensado, tabular, nunca
 * truncado): é o que se confere na peça física.
 */

export const PART_ROW_GRID = 'lg:grid-cols-[minmax(150px,190px)_minmax(0,1fr)_132px_176px_44px]';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export type PartRowMenuItem = { label: string; onSelect: () => void };

type Props = {
  code: string;
  name: string;
  /** Onde serve e referências curtas: modelo, PNC, posição, página. */
  details: string[];
  origin: 'CATALOG' | 'PRICE_LIST';
  /** Etiquetas extras ao lado do nome (ex.: "Conjunto completo", "Código substituído"). */
  tags?: ReactNode;
  price: number | null;
  /** O que mostrar no lugar do preço quando ele não existe (link para o Parceiro). */
  priceMissing?: ReactNode;
  quantityInCart?: number;
  selected?: boolean;
  opening?: boolean;
  onSelect: () => void;
  onOpen?: () => void;
  onAdd: () => void;
  menu: PartRowMenuItem[];
};

export default function PartRow({ code, name, details, origin, tags, price, priceMissing, quantityInCart, selected = false, opening = false, onSelect, onOpen, onAdd, menu }: Props) {
  const inCart = typeof quantityInCart === 'number' && quantityInCart > 0;
  const Region = onOpen ? 'button' : 'div';
  const regionProps = onOpen ? { type: 'button' as const, onClick: onOpen, onFocus: onSelect } : {};

  return (
    <article
      onMouseEnter={onSelect}
      className={cn(
        'group relative grid items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 transition-colors last:border-b-0',
        PART_ROW_GRID,
        selected ? 'bg-selected before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary' : 'hover:bg-muted',
      )}
    >
      <Region {...regionProps} {...(onOpen ? { 'aria-label': `Abrir detalhes de ${name}` } : {})} data-part-result={onOpen ? 'true' : undefined} className="min-w-0 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/60 rounded-sm">
        <span className="block break-all font-code text-[22px] font-semibold leading-7 tracking-wide tabular-nums">{code}</span>
      </Region>

      <Region {...regionProps} className="min-w-0 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/60 rounded-sm">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[17px] font-semibold leading-6">{name}</span>
          {tags}
        </span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">{[origin === 'CATALOG' ? 'Catálogo' : 'Cadastro', ...details].join(' · ')}</span>
      </Region>

      <div className="text-left lg:text-right">
        {price != null ? (
          <span className="font-code text-2xl font-bold leading-7 tabular-nums">{brl.format(price)}</span>
        ) : (
          priceMissing ?? <span className="text-sm text-muted-foreground">Sem preço</span>
        )}
      </div>

      <Button variant={inCart ? 'added' : 'add'} onClick={onAdd} className="w-full">
        {inCart ? <><Icon name="check" className="size-4" />No orçamento · {quantityInCart}</> : '+ Orçamento'}
        <span className="sr-only">, {name}</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Mais ações para ${name}`} disabled={opening} className="justify-self-end">
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {menu.map(item => (
            <DropdownMenuItem key={item.label} onSelect={item.onSelect} className="h-10 text-base">{item.label}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  );
}
