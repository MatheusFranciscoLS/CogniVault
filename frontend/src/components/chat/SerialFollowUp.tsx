import { useState } from 'react';
import type { FormEvent } from 'react';

export default function SerialFollowUp({ disabled, onSubmit }: { disabled: boolean; onSubmit: (serial: string) => void }) {
  const [serial, setSerial] = useState('');
  
  const submitSerial = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = serial.replace(/\D/g, '');
    if (clean.length < 6 || clean.length > 16) return;
    onSubmit(clean);
  };

  return (
    <form onSubmit={submitSerial} className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-800 p-3">
      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300" htmlFor="guided-serial-number">Digite o número de série da etiqueta</label>
      <p className="mt-1 text-[11px] leading-4 text-slate-400">Não é preciso repetir peça, modelo ou PNC. O CogniVault continuará a consulta anterior com este S/N.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id="guided-serial-number"
          inputMode="numeric"
          autoComplete="off"
          value={serial}
          onChange={event => setSerial(event.target.value.replace(/\D/g, '').slice(0, 16))}
          placeholder="Ex.: 20240200001"
          minLength={6}
          maxLength={16}
          required
          className="cv-field min-w-0 flex-1 text-sm"
        />
        <button type="submit" disabled={disabled || serial.length < 6} className="cv-primary px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50">Continuar com S/N</button>
      </div>
    </form>
  );
}
