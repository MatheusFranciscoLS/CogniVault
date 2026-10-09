import { useState } from 'react';
import { Check, Copy, Minus, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { QuoteCartItem } from '../context/QuoteCartContext';
import { cleanErpCode, formatHusqvarnaPartNumber } from '../lib';
import { LINE_COLUMNS, leadChoiceOf, leadTextFor, type LeadChoice } from '../lib/quote-line';
import { formatBRL } from '../lib/quote-message';
import { playCopySound } from '../lib/sound';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LeadSelect({ value, onChange, label, blankLabel }: { value: string; onChange: (value: string) => void; label: string; blankLabel: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={event => onChange(event.target.value)}
      className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
    >
      <option value="">{blankLabel}</option>
      <option value="NOW">Pronta entrega</option>
      <option value="ORDER">Encomenda</option>
    </select>
  );
}

/**
 * Uma linha do orçamento, numa linha só (como a planilha da loja). Serve ao orçamento de PEÇAS (mostra o código copiável, a posição e a prateleira) e ao de
 * CONSERTO (código discreto). O prazo próprio da linha vale sobre o do orçamento.
 */
export default function QuoteLine({ item, variant, quoteLeadTime = '', onQuantity, onPrice, onLead, onRemove }: {
  item: QuoteCartItem;
  variant: 'parts' | 'repair';
  /** Prazo do orçamento (peças): "Encomenda" na linha repete o texto de encomenda dele. */
  quoteLeadTime?: string;
  onQuantity: (delta: number) => void;
  onPrice: (value: number | undefined) => void;
  onLead: (value: string | undefined) => void;
  onRemove: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isService = item.partNumber.startsWith('SRV-');
  const code = item.manufacturer?.toLowerCase().includes('husqvarna') ? formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber) : (item.effectiveCode || item.partNumber);
  const subtotal = item.unitPrice ? item.quantity * item.unitPrice : 0;
  const details = variant === 'parts' && !isService
    ? [item.model, item.pnc ? `PNC ${item.pnc}` : '', item.position ? `Pos. ${item.position}` : ''].filter(Boolean).join(' · ')
    : '';

  const copyCode = () => {
    const clean = cleanErpCode(item.effectiveCode || item.partNumber);
    void navigator.clipboard.writeText(clean);
    playCopySound();
    toast.success(`Código ${clean} copiado.`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <li className={`${LINE_COLUMNS} px-5 py-2.5`}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="line-clamp-2 break-words text-base font-semibold leading-5" title={item.name}>{item.name}</h3>
          {item.isSuperseded && <span className="shrink-0 rounded bg-warn-soft px-1.5 text-sm font-semibold text-warn">Código atualizado</span>}
        </div>
        {!isService && (
          <div className="flex min-w-0 items-center gap-1">
            <span translate="no" className={`truncate font-code tabular-nums ${variant === 'parts' ? 'text-base font-semibold' : 'text-sm text-muted-foreground'}`}>{code}</span>
            {variant === 'parts' && (
              <Button type="button" variant="ghost" size="icon-sm" onClick={copyCode} aria-label={`Copiar o código ${code}`} title="Copiar o código sem espaços nem hífen">
                {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
              </Button>
            )}
            {item.location && <span title="Prateleira" className="shrink-0 text-sm font-semibold text-foreground">Local {item.location}</span>}
          </div>
        )}
        {variant === 'parts' && isService && <span className="text-sm text-muted-foreground">Serviço avulso</span>}
        {details && <p className="truncate text-sm text-muted-foreground">{details}</p>}
      </div>
      <div className="inline-flex h-9 items-center overflow-hidden rounded-md border border-input">
        <button type="button" onClick={() => onQuantity(-1)} disabled={item.quantity <= 1} title={item.quantity <= 1 ? 'Para tirar o item, use o ×' : undefined} aria-label={`Diminuir quantidade de ${item.name}`} className="grid size-9 place-items-center hover:bg-accent focus-visible:bg-accent disabled:opacity-40"><Minus className="size-4" /></button>
        <span className="min-w-8 text-center text-base font-semibold tabular-nums">{item.quantity}</span>
        <button type="button" onClick={() => onQuantity(1)} aria-label={`Aumentar quantidade de ${item.name}`} className="grid size-9 place-items-center hover:bg-accent focus-visible:bg-accent"><Plus className="size-4" /></button>
      </div>
      <Input
        id={`price-${item.id}`}
        type="number"
        inputMode="decimal"
        min={0}
        step={0.01}
        placeholder="R$ un."
        aria-label={`Preço unitário de ${item.name}`}
        value={item.unitPrice ?? ''}
        onChange={event => onPrice(event.target.value === '' ? undefined : Number(event.target.value))}
        className="h-9 w-full text-right font-code text-base font-semibold tabular-nums"
      />
      <LeadSelect
        label={`Prazo de ${item.name}`}
        blankLabel={variant === 'parts' ? 'Do orçamento' : 'Sem prazo'}
        value={leadChoiceOf(item.leadTime)}
        onChange={value => onLead(value === '' ? undefined : leadTextFor(value as LeadChoice, quoteLeadTime))}
      />
      <span className="text-right font-code text-base font-bold tabular-nums">{subtotal > 0 ? formatBRL(subtotal) : ''}</span>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remover ${item.name}`} className="hover:text-destructive"><X className="size-5" /></Button>
    </li>
  );
}
