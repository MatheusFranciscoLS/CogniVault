import { useState } from 'react';
import { formatDiscountInput, parseDiscountInput } from '../lib/discount';
import { Input } from '@/components/ui/input';

/**
 * Desconto (%). Sem atalho e sem desconto automático (dono, 2026-10-09: "se o cliente não pedir, não damos desconto"); quando negociado, o balcão digita
 * ("7" ou "7,5") e o rodapé já mostra o valor. Texto inválido (letra, negativo, mais de 100) marca o campo e NÃO muda o desconto.
 */
export default function DiscountField({ percentage, onChange }: { percentage: number; onChange: (percentage: number) => void }) {
  // O que foi digitado só vale enquanto bate com o desconto do orçamento (esvaziar ou abrir outro zera).
  const [draft, setDraft] = useState<string | null>(null);
  const parsed = draft === null ? null : parseDiscountInput(draft);
  const text = draft !== null && (parsed === null || parsed === percentage) ? draft : null;
  const invalid = text !== null && parseDiscountInput(text) === null;
  const shown = text ?? (percentage !== 0 ? formatDiscountInput(percentage) : '');

  return (
    <div className="space-y-1.5">
      <label htmlFor="quote-discount" className="block text-sm font-medium text-muted-foreground">Desconto</label>
      <div className="relative w-40">
        <Input
          id="quote-discount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label="Desconto (%)"
          placeholder="0"
          value={shown}
          aria-invalid={invalid}
          onChange={event => {
            const next = event.target.value;
            setDraft(next);
            const value = parseDiscountInput(next);
            if (value !== null) onChange(value);
          }}
          className="pr-7 text-right font-code text-base font-semibold"
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">%</span>
      </div>
    </div>
  );
}
