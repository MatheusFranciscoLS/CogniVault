/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
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
  if (!verification || verification.state !== 'SUPERSEDED') return false;
  return normalizePartCode(code) === normalizePartCode(verification.queriedPartNumber)
    && normalizePartCode(verification.queriedPartNumber) !== normalizePartCode(verification.currentPartNumber);
}

export function effectivePartNumber(code: string, verification?: OfficialVerification) {
  return isSupersededForCode(code, verification) ? verification!.currentPartNumber : code;
}

export function verificationLabel(value?: OfficialVerification) {
  if (!value || value.state === 'UNVERIFIED') return 'Não verificado';
  if (value.state === 'VERIFIED') return 'Verificado oficialmente';
  if (value.state === 'SUPERSEDED') return 'Código substituído';
  return 'Precisa de revisão';
}

function verificationClass(value?: OfficialVerification) {
  if (!value || value.state === 'UNVERIFIED') return 'border-slate-200 bg-slate-50 text-slate-500';
  if (value.state === 'VERIFIED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value.state === 'SUPERSEDED') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export function VerificationBadge({ verification, loading = false }: { verification?: OfficialVerification; loading?: boolean }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${verificationClass(verification)}`}>
      {loading && !verification ? 'Carregando estado…' : verificationLabel(verification)}
    </span>
  );
}

type VerificationTarget = Pick<SearchPart, 'partNumber' | 'name'>;
type VerificationStatus = 'VERIFIED' | 'SUPERSEDED' | 'REVIEW';

type PortalLookup = {
  requestedPartNumber: string;
  currentPartNumber: string;
  description: string | null;
  status: VerificationStatus;
  officialUrl: string;
  previousPartNumbers: string[];
  fetchedAt: string;
  source: 'HUSQVARNA_PUBLIC_PORTAL';
};

type Props = {
  target: VerificationTarget;
  existing?: OfficialVerification;
  onClose: () => void;
  onSaved: () => void;
};

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export default function PartVerificationDialog({ target, existing, onClose, onSaved }: Props) {
  const initialStatus: VerificationStatus = existing?.state === 'SUPERSEDED'
    ? 'SUPERSEDED'
    : existing?.state === 'REVIEW'
      ? 'REVIEW'
      : 'VERIFIED';
  const initialQueried = existing?.source !== 'NONE' ? existing?.queriedPartNumber || target.partNumber : target.partNumber;
  const initialCurrent = existing?.source !== 'NONE' ? existing?.currentPartNumber || target.partNumber : target.partNumber;

  const [status, setStatus] = useState<VerificationStatus>(initialStatus);
  const [queriedPartNumber, setQueriedPartNumber] = useState(initialQueried);
  const [currentPartNumber, setCurrentPartNumber] = useState(initialCurrent);
  const [description, setDescription] = useState(existing?.description || target.name);
  const [note, setNote] = useState(existing?.note || '');
  const [verifiedAt, setVerifiedAt] = useState(localDateTimeValue());
  const [saving, setSaving] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalLookup, setPortalLookup] = useState<PortalLookup | null>(null);
  const [error, setError] = useState('');

  const officialUrl = husqvarnaPortalUrl(currentPartNumber);

  const changeStatus = (next: VerificationStatus) => {
    setStatus(next);
    if (next === 'VERIFIED') setCurrentPartNumber(queriedPartNumber);
  };

  const changeQueried = (value: string) => {
    setQueriedPartNumber(value);
    setPortalLookup(null);
    if (status === 'VERIFIED') setCurrentPartNumber(value);
  };

  const consultPublicPortal = async () => {
    const code = normalizePartCode(queriedPartNumber);
    if (!looksLikePartNumber(code)) {
      setError('Informe um código de peça válido antes de consultar o portal.');
      return;
    }

    setPortalLoading(true);
    setError('');
    try {
      const data = await apiJson<{ lookup: PortalLookup }>(
        `/api/part-verifications/${encodeURIComponent(code)}/portal`,
        { timeoutMs: 15_000 },
      );
      const lookup = data.lookup;
      setPortalLookup(lookup);
      setStatus(lookup.status);
      setCurrentPartNumber(lookup.currentPartNumber || code);
      if (lookup.description) setDescription(lookup.description);
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : 'Não foi possível consultar a página pública da Husqvarna.');
    } finally {
      setPortalLoading(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiJson('/api/part-verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          queriedPartNumber,
          currentPartNumber,
          description,
          officialUrl,
          note,
          verifiedAt: new Date(verifiedAt).toISOString(),
        }),
      });
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível registrar a verificação.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-[24px] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[.12em] text-[#1d4f91]">Administrador</div>
            <h2 className="mt-1 text-xl font-semibold">Verificação oficial Husqvarna</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">Você pode abrir a página manualmente ou pedir ao CogniVault para ler a página pública da peça. A consulta automática não usa login, cookies ou sessão autenticada e nunca confirma o registro sem sua ação.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">Fechar</button>
        </div>

        {existing?.source !== 'NONE' && existing?.verifiedAt && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            Último registro: {fmtDate(existing.verifiedAt)}{existing.verifiedBy ? ` · ${existing.verifiedBy}` : ''}. Um novo envio será acrescentado ao histórico, sem apagar o anterior.
          </div>
        )}

        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        {portalLookup && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
            <div className="font-semibold">Leitura da página pública concluída</div>
            <div>Consultado: {portalLookup.requestedPartNumber} · Atual identificado: {portalLookup.currentPartNumber}</div>
            {portalLookup.description && <div>Descrição: {portalLookup.description}</div>}
            {portalLookup.previousPartNumbers.length > 0 && <div>Histórico encontrado: {portalLookup.previousPartNumbers.join(' → ')}</div>}
            <div className="mt-1 text-blue-700">Revise os campos abaixo antes de registrar. O resultado da leitura pública não é salvo automaticamente.</div>
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">
            Estado
            <select value={status} onChange={event => changeStatus(event.target.value as VerificationStatus)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm">
              <option value="VERIFIED">Verificado oficialmente</option>
              <option value="SUPERSEDED">Código substituído</option>
              <option value="REVIEW">Precisa de revisão</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Data da verificação
            <input required type="datetime-local" value={verifiedAt} onChange={event => setVerifiedAt(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Código consultado / antigo
            <input required value={queriedPartNumber} onChange={event => changeQueried(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Código atual
            <input required value={currentPartNumber} onChange={event => setCurrentPartNumber(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" />
          </label>
        </div>

        <label className="mt-4 block text-xs font-semibold text-slate-600">
          Descrição
          <input value={description} onChange={event => setDescription(event.target.value)} maxLength={500} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" />
        </label>
        <label className="mt-4 block text-xs font-semibold text-slate-600">
          URL oficial
          <input value={officialUrl} readOnly className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500" />
        </label>
        <label className="mt-4 block text-xs font-semibold text-slate-600">
          Observação
          <textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" />
        </label>

        <div className="mt-5 flex flex-wrap justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <a href={husqvarnaPortalUrl(queriedPartNumber)} target="_blank" rel="noreferrer" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-[#1d4f91]">Abrir Portal Husqvarna</a>
            <button type="button" disabled={portalLoading} onClick={() => void consultPublicPortal()} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60">
              {portalLoading ? 'Consultando página pública…' : 'Ler página pública'}
            </button>
          </div>
          <button type="submit" disabled={saving} className="cv-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{saving ? 'Registrando…' : 'Confirmar registro oficial'}</button>
        </div>
      </form>
    </div>
  );
}
