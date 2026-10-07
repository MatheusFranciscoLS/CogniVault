/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { apiJson, fmtDate } from '../lib';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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

function neutralOemSearch(code: string, manufacturer?: string | null) {
  const brand = (manufacturer || '').trim();
  const query = brand ? `${brand} OEM part ${code}` : `OEM part ${code}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/**
 * Escolhe a saída de conferência somente pela marca conhecida. A forma do
 * código não prova fabricante: Husqvarna e Kawasaki, por exemplo, podem ter
 * códigos numéricos com o mesmo comprimento.
 */
export function officialPortalUrl(code: string, manufacturer?: string | null) {
  const normMfg = (manufacturer || '').toUpperCase();
  if (normMfg.includes('HUSQVARNA')) return husqvarnaPortalUrl(code);
  if (normMfg.includes('KAWASAKI')) return neutralOemSearch(code, 'Kawasaki Engines');
  if (normMfg.includes('STIHL')) return neutralOemSearch(code, 'Stihl');
  if (normMfg.includes('KOHLER')) return neutralOemSearch(code, 'Kohler Engines');
  if (normMfg.includes('BRIGGS')) return neutralOemSearch(code, 'Briggs and Stratton');
  if (normMfg.includes('HONDA')) return neutralOemSearch(code, 'Honda');
  return neutralOemSearch(code);
}

export function officialPortalLabel(_code: string, manufacturer?: string | null) {
  const normMfg = (manufacturer || '').toUpperCase();
  if (normMfg.includes('HUSQVARNA')) return 'Verificar oficial Husqvarna';
  if (normMfg.includes('KAWASAKI')) return 'Pesquisar fonte Kawasaki';
  if (normMfg.includes('STIHL')) return 'Pesquisar fonte Stihl';
  if (normMfg.includes('KOHLER')) return 'Pesquisar fonte Kohler';
  if (normMfg.includes('BRIGGS')) return 'Pesquisar fonte Briggs & Stratton';
  if (normMfg.includes('HONDA')) return 'Pesquisar fonte Honda';
  return 'Pesquisar fabricante / fonte oficial';
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
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-sm font-semibold ${verificationClass(verification)}`}>
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

/**
 * Conferência de um código no Portal Husqvarna, enviada ao administrador para aprovar.
 *
 * Diálogo do shadcn (foco preso, Esc fecha, `role="dialog"`). O texto antigo explicava como o sistema registra
 * usuário, data e fonte; o balcão só precisa saber o que fazer: abrir o Portal, ver o código atual e enviar.
 */
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
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[92dvh] gap-5 overflow-y-auto sm:max-w-lg" showCloseButton={!saving}>
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold">Registrar conferência</DialogTitle>
            <DialogDescription className="sr-only">Confira o código no Portal Husqvarna e envie para aprovação do administrador.</DialogDescription>
          </DialogHeader>

          {existing?.source !== 'NONE' && existing?.verifiedAt && (
            <p className="text-base text-muted-foreground">
              Última conferência aprovada em {fmtDate(existing.verifiedAt)}{existing.verifiedBy ? ` por ${existing.verifiedBy}` : ''}.
            </p>
          )}

          {error && <p role="alert" className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-base text-destructive">{error}</p>}

          <section className="rounded-lg border border-border bg-muted p-4">
            <h3 className="text-base font-semibold">{target.name}</h3>
            <p translate="no" className="mt-1 break-all font-code text-2xl font-semibold tabular-nums">{target.partNumber}</p>
            <Button asChild variant="outline" className="mt-3">
              <a href={husqvarnaPortalUrl(target.partNumber)} target="_blank" rel="noreferrer noopener">Abrir Portal Husqvarna<ExternalLink className="size-4" aria-hidden="true" /></a>
            </Button>
          </section>

          <div className="grid gap-1.5">
            <label htmlFor="verification-code" className="text-base font-semibold">Código atual no Portal</label>
            <Input
              id="verification-code"
              autoFocus
              required
              value={currentPartNumber}
              onChange={event => setCurrentPartNumber(event.target.value)}
              placeholder="Digite ou cole o código atual"
              className="h-11 font-code text-lg tabular-nums"
            />
            <p className={`text-base ${validCurrentCode ? (changed ? 'text-warn' : 'text-ok') : 'text-muted-foreground'}`}>
              {validCurrentCode
                ? (changed ? `Substituição: ${target.partNumber} → ${currentPartNumber}. O administrador precisa aprovar.` : 'O código continua o mesmo.')
                : 'Digite um código válido.'}
            </p>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="verification-note" className="text-base font-semibold">Observação <span className="font-normal text-muted-foreground">(opcional)</span></label>
            <textarea
              id="verification-note"
              value={note}
              onChange={event => setNote(event.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving || !validCurrentCode}>{saving ? 'Enviando…' : 'Enviar para aprovação'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
