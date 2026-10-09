import { useState } from 'react';
import { PAYMENT_30_DAYS, PAYMENT_CASH, paymentChoice } from '../lib/payment-terms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Condição de pagamento (dono, 2026-10-09): "À vista", "A prazo 30 dias" ou um campo para escrever outra. Sem nada marcado, o orçamento sai "A combinar".
 * Clicar de novo no botão marcado desmarca. O texto fica guardado como está (`paymentMethod` é texto livre).
 */
export default function PaymentTerms({ value, onChange, idPrefix = 'quote' }: { value: string | undefined; onChange: (text: string) => void; idPrefix?: string }) {
  const choice = paymentChoice(value);
  // "Outro" escolhido e ainda sem texto: o campo já aparece, mesmo com o texto vazio.
  const [writing, setWriting] = useState(false);
  const showField = choice === 'OTHER' || writing;

  const pick = (next: 'CASH' | 'DAYS30') => {
    setWriting(false);
    onChange(choice === next ? '' : next === 'CASH' ? PAYMENT_CASH : PAYMENT_30_DAYS);
  };
  const other = () => {
    if (showField) {
      setWriting(false);
      onChange('');
      return;
    }
    setWriting(true);
    if (choice !== 'NONE') onChange('');
  };

  const buttons: Array<[string, boolean, () => void]> = [
    ['À vista', choice === 'CASH', () => pick('CASH')],
    ['30 dias', choice === 'DAYS30', () => pick('DAYS30')],
    ['Outro', showField, other],
  ];

  return (
    <div className="space-y-1.5">
      <span id={`${idPrefix}-payment-label`} className="block text-sm font-medium text-muted-foreground">Pagamento</span>
      <div role="group" aria-labelledby={`${idPrefix}-payment-label`} className="flex flex-wrap gap-2">
        {buttons.map(([label, active, onClick]) => (
          <Button key={label} type="button" size="sm" variant="outline" className={active ? 'border-ring bg-selected' : undefined} aria-pressed={active} onClick={onClick}>{label}</Button>
        ))}
      </div>
      {showField && (
        <Input
          id={`${idPrefix}-payment-other`}
          aria-label="Condição de pagamento (escreva)"
          type="text"
          autoComplete="off"
          maxLength={120}
          value={choice === 'OTHER' ? (value ?? '') : ''}
          onChange={event => onChange(event.target.value)}
          placeholder="Ex.: 50% na entrada e 50% em 15 dias"
          className="text-base"
        />
      )}
    </div>
  );
}
