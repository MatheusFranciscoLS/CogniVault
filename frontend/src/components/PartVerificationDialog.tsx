/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiJson, fmtDate } from '../lib';
import { useOverlayLifecycle } from '../lib/useOverlayLifecycle';
import type { OfficialVerification, SearchPart } from '../types';

export const HUSQVARNA_PORTAL_BASE = 'https://portal.husqvarnagroup.com/br/spare-parts/?part=';

export function normalizePartCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function looksLikePartNumber(value: string) {
  const normalized = normalizePartCode(value);
  const digitCount = normalized.replace(/\D/g, '').length;
  return normalized.length >= 6 && digitCount >= 5;
}

export function husqvarnaPortalUrl(code: string) {
  return `${HUSQVARNA_PORTAL_BASE}${encodeURIComponent(normalizePartCode(code))}`;
}

export function officialPortalUrl(code: string, manufacturer?: string | null) {
  const normMfg = (manufacturer || '').toUpperCase();
  const normCode = normalizePartCode(code);
  if (normMfg.includes('KAWASAKI') || /^\d{5}\d{4}$/.test(normCode)) {
    return `https://www.google.com/search?q=${encodeURIComponent(`Kawasaki Engines OEM part ${code}`)}`;
  }
  if (normMfg.includes('STIHL')) {
    return `https://www.google.com/search?q=${encodeURIComponent(`Stihl OEM part ${code}`)}`;
  }
  if (normMfg.includes('KOHLER')) {
    return `https://www.google.com/search?q=${encodeURIComponent(`Kohler Engines OEM part ${code}`)}`;
  }
  if (normMfg.includes('BRIGGS')) {
    return `https://www.google.com/search?q=${encodeURIComponent(`Briggs and Stratton OEM part ${code}`)}`;
  }
  return husqvarnaPortalUrl(code);
}

export function officialPortalLabel(code: string, manufacturer?: string | null) {
  const normMfg = (manufacturer || '').toUpperCase();
  const normCode = normalizePartCode(code);
  if (normMfg.includes('KAWASAKI') || /^\d{5}\d{4}$/.test(normCode)) {
    return 'Verificar Kawasaki';
  }
  if (normMfg.includes('STIHL')) {
    return 'Verificar Stihl';
  }
  if (normMfg.includes('KOHLER')) {
    return 'Verificar Kohler';
  }
  return 'Verificar oficial Husqvarna';
}

export function isSupersededForCode(code: string, verification?: OfficialVerification) {
  if (!verification || verification.state !== 'SUPERSEDED' || verification.cacheState === 'STALE') return false;
  return normalizePartCode(code) === normalizePartCode(verification.queriedPartNumber)
    && normalizePartCode(verification.queriedPartNumber) !== normalizePartCode(verification.currentPartNumber);
}

export function effectivePartNumber(code: string, verification?: OfficialVerification) {
  return isSupersededForCode(code, verification) ? verification!.currentPartNumber : code;
}

export function verificationLabel(value?: OfficialVerification) {
  if (!value || value.state === 'UNVERIFIED') return 'Não verificado';
  if (value.cacheState === 'STALE') return 'Revisão oficial vencida';
  if (value.state === 'VERIFIED') return 'Verificado oficialmente';
  if (value.state === 'SUPERSEDED') return 'Código substituído';
  return 'Precisa de revisão';
}

function verificationClass(value?: OfficialVerification) {
  if (!value || value.state === 'UNVERIFIED') return 'border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/50 text-ink-500 dark:text-ink-400';
  if (value.cacheState === 'STALE') return 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
  if (value.state === 'VERIFIED') return 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
  if (value.state === 'SUPERSEDED') return 'border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-ink-900 text-brand-700 dark:text-brand-300';
  return 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
}

export function VerificationBadge({ verification, loading = false }: { verification?: OfficialVerification; loading?: boolean }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${verificationClass(verification)}`}>
      {loading && !verification ? 'Carregando estado…' : verificationLabel(verification)}
    </span>
  );
}

type VerificationTarget = Pick<SearchPart, 'partNumber' | 'name'>;

type Props = {
  target: VerificationTarget;
  existing?: OfficialVerification;
  onClose: () => void;
  onSaved: () => void;
};

export default function PartVerificationDialog({ target, existing, onClose, onSaved }: Props) {
  const approvedCurrent = existing?.source !== 'NONE' && existing?.state === 'SUPERSEDED'
    ? existing.currentPartNumber
    : target.partNumber;
  const [currentPartNumber, setCurrentPartNumber] = useState(approvedCurrent);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useOverlayLifecycle({ onClose });

  const queriedCode = normalizePartCode(target.partNumber);
  const currentCode = normalizePartCode(currentPartNumber);
  const changed = Boolean(queriedCode && currentCode && queriedCode !== currentCode);
  const validCurrentCode = looksLikePartNumber(currentPartNumber);
  const generatedUrl = useMemo(() => husqvarnaPortalUrl(currentPartNumber || target.partNumber), [currentPartNumber, target.partNumber]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validCurrentCode) {
      setError('Informe o código atual exatamente como você conferiu no Portal Husqvarna.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await apiJson('/api/part-verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queriedPartNumber: target.partNumber,
          currentPartNumber,
          description: target.name,
          note,
        }),
      });
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível enviar a conferência para aprovação.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-ink-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="max-h-[100dvh] w-full max-w-xl overflow-auto rounded-t-2xl bg-white p-4 shadow-2xl dark:bg-ink-900 sm:max-h-[92dvh] sm:rounded-2xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-dialog-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[.12em] text-brand-600 dark:text-brand-300 sm:text-xs">Conferência assistida</div>
            <h2 id="verification-dialog-title" className="mt-1 text-lg font-semibold text-ink-950 dark:text-white sm:text-xl">Registrar conferência Husqvarna</h2>
            <p className="mt-2 text-xs leading-5 text-ink-500 dark:text-ink-400">Abra o Portal Husqvarna, confira o código exibido e informe somente o código atual. O CogniVault registra usuário, data, fonte oficial e tipo da alteração automaticamente. O resultado só passa a valer depois da aprovação do Administrador.</p>
          </div>
          <button type="button" disabled={saving} onClick={onClose} className="shrink-0 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-bold text-ink-600 disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300">Fechar</button>
        </div>

        {existing?.source !== 'NONE' && existing?.verifiedAt && (
          <div className="mt-4 rounded-xl border border-ink-200 bg-ink-50 p-3 text-xs leading-5 text-ink-500 dark:border-ink-700 dark:bg-ink-800/50 dark:text-ink-400">
            Última aprovação oficial: {fmtDate(existing.verifiedAt)}{existing.verifiedBy ? ` · ${existing.verifiedBy}` : ''}.
            {existing.cacheState === 'FRESH' ? ` O resultado está válido no cache${existing.freshUntil ? ` até ${fmtDate(existing.freshUntil)}` : ''}.` : ' A validade venceu e uma nova conferência pode ser enviada.'}
            {' '}O histórico anterior nunca é apagado.
          </div>
        )}

        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">{error}</div>}

        <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50 p-4 dark:border-brand-700 dark:bg-ink-900/50">
          <div className="text-[10px] font-bold uppercase tracking-[.1em] text-brand-700 dark:text-brand-300">Peça conferida</div>
          <div className="mt-1 text-sm font-semibold text-ink-800 dark:text-ink-200">{target.name}</div>
          <div className="mt-1 break-all font-mono text-lg font-bold text-brand-600 dark:text-brand-300">{target.partNumber}</div>
          <a href={husqvarnaPortalUrl(target.partNumber)} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-600 dark:border-brand-600 dark:bg-ink-800 dark:text-brand-300">
            Abrir Portal Husqvarna →
          </a>
        </div>

        <label className="mt-5 block text-xs font-semibold text-ink-600 dark:text-ink-400">
          Código atual mostrado no Portal
          <input
            autoFocus
            required
            value={currentPartNumber}
            onChange={event => setCurrentPartNumber(event.target.value)}
            placeholder="Digite ou cole o código atual"
            className="mt-1 w-full rounded-xl border border-ink-200 bg-white p-3 text-sm text-ink-900 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 dark:border-ink-700 dark:bg-ink-800 dark:text-white"
          />
        </label>

        <div className={`mt-3 rounded-xl border p-3 text-xs leading-5 ${changed ? 'border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-ink-900 text-brand-800 dark:text-brand-300' : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'}`}>
          {validCurrentCode ? (
            changed
              ? <><b>Substituição detectada automaticamente:</b> {target.partNumber} → {currentPartNumber}. O Administrador precisará aprovar antes de o sistema usar o novo código.</>
              : <><b>Código permanece atual.</b> A conferência será enviada para aprovação como confirmação oficial.</>
          ) : 'Digite um código válido para o CogniVault identificar automaticamente se houve substituição.'}
        </div>

        <label className="mt-4 block text-xs font-semibold text-ink-600 dark:text-ink-400">
          Observação opcional
          <textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={3} placeholder="Ex.: conferido na tela de spare parts; descrição apresentada no portal." className="mt-1 w-full rounded-xl border border-ink-200 bg-white p-3 text-sm text-ink-900 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 dark:border-ink-700 dark:bg-ink-800 dark:text-white" />
        </label>

        <div className="mt-3 rounded-xl bg-ink-50 p-3 text-[11px] leading-5 text-ink-500 dark:bg-ink-800/50 dark:text-ink-400">
          Fonte que ficará vinculada automaticamente: <span className="break-all font-medium text-ink-700 dark:text-ink-300">{generatedUrl}</span>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-ink-100 pt-4 pb-[max(0rem,env(safe-area-inset-bottom))] dark:border-ink-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] leading-5 text-ink-400">O CogniVault reutiliza aprovações recentes; telas novas ou vencidas continuam com conferência humana no portal.</div>
          <button type="submit" disabled={saving || !validCurrentCode} className="cv-primary w-full shrink-0 px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
            {saving ? 'Enviando…' : 'Enviar para aprovação'}
          </button>
        </div>
      </form>
    </div>
  );
}
