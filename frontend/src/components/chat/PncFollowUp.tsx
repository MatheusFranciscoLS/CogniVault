import { useState } from 'react';
import type { FormEvent } from 'react';

/**
 * Campo para digitar o PNC à mão.
 *
 * Pedido do dono, com o motivo dele: *"nem sempre os PNC que você citou pra mim
 * é o correto e tem disponível, talvez tenha que escrever manualmente"*.
 *
 * As opções em botão vêm do que está cadastrado nesta base — que é o que o app
 * conhece, não o que existe no mundo. A etiqueta da máquina na bancada manda
 * mais que a nossa lista, e sem este campo o atendente ficava preso às opções
 * oferecidas.
 *
 * O PNC da Husqvarna tem 8 a 14 dígitos, e a etiqueta costuma imprimir com
 * espaços e hífen (`967 17 65-01`). A limpeza é feita aqui para o atendente
 * poder digitar exatamente como está na etiqueta.
 */
export default function PncFollowUp({ disabled, onSubmit }: { disabled: boolean; onSubmit: (pnc: string) => void }) {
  const [pnc, setPnc] = useState('');
  const clean = pnc.replace(/\D/g, '');
  const valid = clean.length >= 8 && clean.length <= 14;

  const submitPnc = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) return;
    onSubmit(clean);
  };

  return (
    <form onSubmit={submitPnc} className="mt-2 rounded-xl border border-ink-200 bg-white p-3 dark:border-ink-700 dark:bg-ink-800">
      <label className="block text-xs font-bold text-ink-800 dark:text-ink-100" htmlFor="guided-pnc-number">
        O PNC não está na lista? Digite o da etiqueta
      </label>
      <p className="mt-1 text-[11px] leading-4 text-ink-500 dark:text-ink-400">
        Pode digitar como está na etiqueta, com espaços e hífen.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id="guided-pnc-number"
          inputMode="numeric"
          autoComplete="off"
          value={pnc}
          onChange={event => setPnc(event.target.value.replace(/[^\d\s-]/g, '').slice(0, 20))}
          placeholder="Ex.: 967 17 65-01"
          required
          className="cv-field min-w-0 flex-1 text-sm"
        />
        <button
          type="submit"
          disabled={disabled || !valid}
          className="cv-touch-target shrink-0 rounded-lg bg-accent-700 px-4 text-xs font-bold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Buscar com este PNC
        </button>
      </div>
      {pnc && !valid ? (
        <p className="mt-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          O PNC da Husqvarna tem de 8 a 14 dígitos — este tem {clean.length}.
        </p>
      ) : null}
    </form>
  );
}
