/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiJson, fmtDate } from '../lib';
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
  if (!value || value.state === 'UNVERIFIED') return 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400';
  if (value.cacheState === 'STALE') return 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
  if (value.state === 'VERIFIED') return 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
  if (value.state === 'SUPERSEDED') return 'border-blue-200 dark:border-blue-600 bg-blue-50 dark:bg-[#123867] text-blue-700 dark:text-blue-300';
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
    <div className="fixed inset-0 z-[85] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-xl overflow-auto rounded-[24px] bg-white dark:bg-slate-800 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[.12em] text-[#1d4f91] dark:text-blue-300">Conferência assistida</div>
            <h2 className="mt-1 text-xl font-semibold">Registrar conferência Husqvarna</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Abra o Portal Husqvarna, confira o código exibido e informe somente o código atual. O CogniVault registra usuário, data, fonte oficial e tipo da alteração automaticamente. O resultado só passa a valer depois da aprovação do Administrador.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">Fechar</button>
        </div>

        {existing?.source !== 'NONE' && existing?.verifiedAt && (
          <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Última aprovação oficial: {fmtDate(existing.verifiedAt)}{existing.verifiedBy ? ` · ${existing.verifiedBy}` : ''}.
            {existing.cacheState === 'FRESH' ? ` O resultado está válido no cache${existing.freshUntil ? ` até ${fmtDate(existing.freshUntil)}` : ''}.` : ' A validade venceu e uma nova conferência pode ser enviada.'}
            {' '}O histórico anterior nunca é apagado.
          </div>
        )}

        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>}

        <div className="mt-5 rounded-2xl border border-blue-100 dark:border-blue-700 bg-blue-50 dark:bg-[#123867]/50 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[.1em] text-blue-700 dark:text-blue-300">Peça conferida</div>
          <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">{target.name}</div>
          <div className="mt-1 text-lg font-bold text-[#1d4f91] dark:text-blue-300">{target.partNumber}</div>
          <a href={husqvarnaPortalUrl(target.partNumber)} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-xl border border-blue-200 dark:border-blue-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-[#1d4f91] dark:text-blue-300">
            Abrir Portal Husqvarna →
          </a>
        </div>

        <label className="mt-5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
          Código atual mostrado no Portal
          <input
            autoFocus
            required
            value={currentPartNumber}
            onChange={event => setCurrentPartNumber(event.target.value)}
            placeholder="Digite ou cole o código atual"
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-sm"
          />
        </label>

        <div className={`mt-3 rounded-xl border p-3 text-xs leading-5 ${changed ? 'border-blue-200 dark:border-blue-600 bg-blue-50 dark:bg-[#123867] text-blue-800 dark:text-blue-300' : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'}`}>
          {validCurrentCode ? (
            changed
              ? <><b>Substituição detectada automaticamente:</b> {target.partNumber} → {currentPartNumber}. O Administrador precisará aprovar antes de o sistema usar o novo código.</>
              : <><b>Código permanece atual.</b> A conferência será enviada para aprovação como confirmação oficial.</>
          ) : 'Digite um código válido para o CogniVault identificar automaticamente se houve substituição.'}
        </div>

        <label className="mt-4 block text-xs font-semibold text-slate-600 dark:text-slate-400">
          Observação opcional
          <textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={3} placeholder="Ex.: conferido na tela de spare parts; descrição apresentada no portal." className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-sm" />
        </label>

        <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          Fonte que ficará vinculada automaticamente: <span className="break-all font-medium text-slate-700 dark:text-slate-300">{generatedUrl}</span>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] leading-5 text-slate-400">O CogniVault reutiliza aprovações recentes; telas novas ou vencidas continuam com conferência humana no portal.</div>
          <button type="submit" disabled={saving || !validCurrentCode} className="cv-primary px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? 'Enviando…' : 'Enviar para aprovação'}
          </button>
        </div>
      </form>
    </div>
  );
}
