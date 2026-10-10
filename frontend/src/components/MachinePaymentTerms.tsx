import { useState } from 'react';
import { MACHINE_PAYMENT_OTHER_MAX, type MachinePaymentChoice } from '../lib/machine-payment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Condição de pagamento do orçamento de MÁQUINA: três meios que o cliente pode escolher (à vista, cartão em até 10x sem juros, boleto em até 6x sem juros),
 * mais "Outro" para escrever. Cada botão liga e desliga (podem valer vários). O boleto vem desmarcado: a loja precisa consultar e ele não vale na primeira compra.
 */
export default function MachinePaymentTerms({ value, onChange, idPrefix = 'machine' }: { value: MachinePaymentChoice; onChange: (next: MachinePaymentChoice) => void; idPrefix?: string }) {
  // "Outro" aberto e ainda sem texto: o campo já aparece, mesmo vazio.
  const [writing, setWriting] = useState(false);
  const showField = writing || value.other !== '';

  const buttons: Array<[string, boolean, () => void]> = [
    ['À vista', value.cash, () => onChange({ ...value, cash: !value.cash })],
    ['Cartão 10x sem juros', value.card, () => onChange({ ...value, card: !value.card })],
    ['Boleto 6x sem juros', value.boleto, () => onChange({ ...value, boleto: !value.boleto })],
    ['Outro', showField, () => { if (showField) { setWriting(false); onChange({ ...value, other: '' }); } else setWriting(true); }],
  ];

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <span id={`${idPrefix}-payment-label`} className="block text-base font-medium">Condição de pagamento</span>
      <div role="group" aria-labelledby={`${idPrefix}-payment-label`} className="flex flex-wrap gap-2">
        {buttons.map(([label, active, onClick]) => (
          <Button key={label} type="button" variant="outline" className={active ? 'border-ring bg-selected font-semibold' : undefined} aria-pressed={active} onClick={onClick}>{label}</Button>
        ))}
      </div>
      {value.boleto && <p role="status" className="text-sm font-semibold text-warn">Consulte antes: o boleto não vale na primeira compra.</p>}
      {showField && (
        <Input
          id={`${idPrefix}-payment-other`}
          aria-label="Condição de pagamento (escreva)"
          type="text"
          autoComplete="off"
          maxLength={MACHINE_PAYMENT_OTHER_MAX}
          value={value.other}
          onChange={event => onChange({ ...value, other: event.target.value })}
          placeholder="Ex.: 50% na entrada e 50% em 15 dias"
          className="text-base"
        />
      )}
    </div>
  );
}
