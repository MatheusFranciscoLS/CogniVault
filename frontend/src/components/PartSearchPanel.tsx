import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import { api, apiJson, json } from '../lib';
import type { OfficialVerification, PartDetail, SearchPart } from '../types';

type SearchDocument = {
  id: string;
  filename: string;
  manufacturer: string | null;
  model: string | null;
  pnc: string | null;
  partCount: number;
};

type PdfPreview = { url: string; page: number | null; title: string };
type Props = { initialQuery: string; onQueryChange: (query: string) => void; admin?: boolean };
type VerificationForm = {
  status: 'VERIFIED' | 'SUPERSEDED' | 'REVIEW';
  queriedPartNumber: string;
  currentPartNumber: string;
  description: string;
  officialUrl: string;
  note: string;
  verifiedAt: string;
};

const PORTAL_BASE = 'https://portal.husqvarnagroup.com/br/spare-parts/?part=';

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function portalUrl(code: string) {
  return `${PORTAL_BASE}${encodeURIComponent(normalizeCode(code))}`;
}

function verificationLabel(value?: OfficialVerification) {
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

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[18px] border border-slate-200 bg-white p-4"><div className="text-[10px] font-semibold uppercase tracking-[.1em] text-slate-400">{label}</div><div className="mt-1 text-sm font-semibold text-slate-800">{value}</div></div>;
}

function SearchSkeleton() {
  return <div className="divide-y divide-slate-100" aria-hidden="true">{[0, 1, 2].map(item => <div key={item} className="animate-pulse p-5"><div className="h-3 w-2/5 rounded-full bg-slate-200"/><div className="mt-3 h-6 w-1/3 rounded-lg bg-blue-100"/><div className="mt-4 h-3 rounded-full bg-slate-100"/></div>)}</div>;
}

export default function PartSearchPanel({ initialQuery, onQueryChange, admin = false }: Props) {
  const normalizedInitialQuery = initialQuery.trim();
  const [query, setQuery] = useState(initialQuery);
  const [lastQuery, setLastQuery] = useState(normalizedInitialQuery);
  const [parts, setParts] = useState<SearchPart[]>([]);
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  const [loading, setLoading] = useState(normalizedInitialQuery.length >= 2);
  const [hasSearched, setHasSearched] = useState(normalizedInitialQuery.length >= 2);
  const [detail, setDetail] = useState<PartDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PdfPreview | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [replacementNotice, setReplacementNotice] = useState('');
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verifications, setVerifications] = useState<Record<string, OfficialVerification>>({});
  const [savingVerification, setSavingVerification] = useState(false);
  const [form, setForm] = useState<VerificationForm | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<number | null>(null);

  const showNotice = useCallback((message: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2200);
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const loadVerifications = useCallback(async (items: SearchPart[]) => {
    if (!items.length) { setVerifications({}); return; }
    setVerificationLoading(true);
    try {
      const codes = [...new Set(items.map(item => item.partNumber))].join(',');
      const data = await apiJson<{ verifications: OfficialVerification[] }>(`/api/part-verifications?codes=${encodeURIComponent(codes)}`);
      const map: Record<string, OfficialVerification> = {};
      data.verifications.forEach(item => { map[normalizeCode(item.queriedPartNumber)] = item; });
      setVerifications(map);
    } catch {
      setVerifications({});
    } finally {
      setVerificationLoading(false);
    }
  }, []);

  const resolveQuery = useCallback(async (value: string) => {
    try {
      const data = await apiJson<{ verifications: OfficialVerification[] }>(`/api/part-verifications?codes=${encodeURIComponent(value)}`);
      const verification = data.verifications[0];
      if (verification?.state === 'SUPERSEDED') {
        setReplacementNotice(`${verification.queriedPartNumber} → ${verification.currentPartNumber}`);
        return verification.currentPartNumber;
      }
    } catch {
      // A busca técnica continua normalmente se o estado de verificação estiver indisponível.
    }
    setReplacementNotice('');
    return value;
  }, []);

  const runSearch = useCallback(async (value: string, signal?: AbortSignal) => {
    setLoading(true); setHasSearched(true); setLastQuery(value); setError(''); setParts([]); setDocuments([]);
    try {
      const effectiveValue = await resolveQuery(value);
      const data = await apiJson<{ parts: SearchPart[]; documents: SearchDocument[] }>(`/api/search?q=${encodeURIComponent(effectiveValue)}`, signal ? { signal } : undefined);
      if (signal?.aborted) return;
      setParts(data.parts); setDocuments(data.documents);
      void loadVerifications(data.parts);
    } catch (searchError) {
      if (searchError instanceof Error && searchError.name === 'AbortError') return;
      setError(searchError instanceof Error ? searchError.message : 'Erro ao pesquisar.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [loadVerifications, resolveQuery]);

  useEffect(() => {
    if (normalizedInitialQuery.length < 2) { setLoading(false); return; }
    const controller = new AbortController();
    void runSearch(normalizedInitialQuery, controller.signal);
    return () => controller.abort();
  }, [normalizedInitialQuery, runSearch]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (pdf) setPdf(null); else if (detail) setDetail(null);
      }
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault(); inputRef.current?.focus(); inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, pdf]);

  const copyCode = useCallback(async (value: string) => {
    try { await navigator.clipboard.writeText(value); showNotice(`Código ${value} copiado.`); }
    catch { showNotice(`Código: ${value}`); }
  }, [showNotice]);

  const openPart = useCallback(async (id: string) => {
    setDetailLoadingId(id); setError('');
    try { const data = await apiJson<{ part: PartDetail }>(`/api/parts/${id}`); setDetail(data.part); }
    catch (partError) { setError(partError instanceof Error ? partError.message : 'Não foi possível abrir a peça.'); }
    finally { setDetailLoadingId(null); }
  }, []);

  const accessPdf = useCallback(async (documentId: string, page: number | null, title: string) => {
    setError('');
    try { const data = await apiJson<{ url: string }>(`/api/documents/${documentId}/access?mode=view`); setPdf({ url: data.url, page, title }); }
    catch (pdfError) { setError(pdfError instanceof Error ? pdfError.message : 'Não foi possível abrir o catálogo.'); }
  }, []);

  const toggleFavorite = useCallback(async () => {
    if (!detail) return;
    try {
      if (detail.favoriteId) {
        await json(await api(`/api/favorites/${detail.favoriteId}`, { method: 'DELETE' }));
        setDetail(current => current ? { ...current, favoriteId: null } : current); showNotice('Favorito removido.');
      } else {
        const data = await apiJson<{ favorite: { id: string } }>('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partId: detail.id }) });
        setDetail(current => current ? { ...current, favoriteId: data.favorite.id } : current); showNotice('Peça adicionada aos favoritos.');
      }
    } catch (favoriteError) { setError(favoriteError instanceof Error ? favoriteError.message : 'Não foi possível atualizar o favorito.'); }
  }, [detail, showNotice]);

  const beginVerification = useCallback((part: Pick<SearchPart, 'partNumber' | 'name'>) => {
    const existing = verifications[normalizeCode(part.partNumber)];
    const current = existing?.currentPartNumber || part.partNumber;
    setForm({
      status: existing?.state === 'SUPERSEDED' ? 'SUPERSEDED' : existing?.state === 'REVIEW' ? 'REVIEW' : 'VERIFIED',
      queriedPartNumber: existing?.queriedPartNumber || part.partNumber,
      currentPartNumber: current,
      description: existing?.description || part.name,
      officialUrl: existing?.officialUrl || portalUrl(current),
      note: existing?.note || '',
      verifiedAt: new Date().toISOString().slice(0, 16),
    });
  }, [verifications]);

  const saveVerification = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setSavingVerification(true); setError('');
    try {
      await apiJson('/api/part-verifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, verifiedAt: new Date(form.verifiedAt).toISOString() }),
      });
      setForm(null); showNotice('Verificação oficial registrada.');
      await loadVerifications(parts);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Não foi possível registrar a verificação.'); }
    finally { setSavingVerification(false); }
  }, [form, loadVerifications, parts, showNotice]);

  const submit = (event: FormEvent) => {
    event.preventDefault(); const value = query.trim();
    if (value.length < 2) { setError('Digite ao menos 2 caracteres para pesquisar.'); inputRef.current?.focus(); return; }
    if (value !== normalizedInitialQuery) { onQueryChange(value); return; }
    void runSearch(value);
  };

  const detailVerification = useMemo(() => detail ? verifications[normalizeCode(detail.partNumber)] : undefined, [detail, verifications]);
  const resultSummary = loading ? 'Pesquisando na base técnica…' : hasSearched ? `${parts.length} ${parts.length === 1 ? 'peça encontrada' : 'peças encontradas'}${lastQuery ? ` para “${lastQuery}”` : ''}` : 'Informe um código, uma descrição, um modelo ou um PNC.';

  const closeDetailFromBackdrop = (event: ReactMouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) setDetail(null); };
  const closePdfFromBackdrop = (event: ReactMouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) setPdf(null); };

  return <section>
    {notice && <div role="status" className="fixed right-5 top-20 z-[100] rounded-xl bg-slate-950 px-4 py-2.5 text-sm text-white shadow-xl">{notice}</div>}
    <p className="cv-kicker">Atendimento rápido</p><h1 className="cv-page-title">Peças e catálogos</h1>
    <p className="mt-2 text-sm text-slate-500">Encontre, confira e copie o código sem interromper o atendimento ao cliente.</p>

    <form onSubmit={submit} className="cv-surface mt-6 rounded-[22px] p-2">
      <div className="flex gap-2"><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex.: 537 04 19-01, carburador 143RS ou PNC" autoFocus className="min-w-0 flex-1 rounded-2xl border-0 px-4 py-3 text-sm outline-none"/><button type="submit" disabled={loading} className="cv-primary min-w-[92px] px-5 text-sm font-semibold">{loading ? 'Buscando…' : 'Buscar'}</button></div>
    </form>

    {replacementNotice && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800">Substituição oficial aplicada: {replacementNotice}</div>}
    {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]">
      <div className="cv-surface overflow-hidden rounded-[22px]" aria-busy={loading}>
        <div className="border-b border-slate-200 px-5 py-4"><div className="font-semibold">Resultado da consulta</div><div className="mt-0.5 text-xs text-slate-400">{resultSummary}</div></div>
        {loading ? <SearchSkeleton/> : <div className="divide-y divide-slate-100">{parts.map(part => {
          const verification = verifications[normalizeCode(part.partNumber)];
          const opening = detailLoadingId === part.id;
          const effectiveCode = verification?.state === 'SUPERSEDED' ? verification.currentPartNumber : part.partNumber;
          return <article key={part.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <button type="button" onClick={() => void openPart(part.id)} className="min-w-0 rounded-xl p-2 text-left hover:bg-slate-50">
              <div className="text-sm font-semibold text-slate-800">{part.name}</div>
              <div className="mt-1 text-xl font-bold tracking-tight text-[#1d4f91]">{verification?.state === 'SUPERSEDED' ? <><span className="text-slate-400 line-through">{part.partNumber}</span> <span>→ {verification.currentPartNumber}</span></> : part.partNumber}</div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3"><div>Modelo <strong className="block">{part.model}</strong></div><div>PNC <strong className="block">{part.pnc || '—'}</strong></div><div>Fonte <strong className="block truncate">{part.filename}</strong></div></div>
            </button>
            <div className="flex flex-wrap items-center gap-2 self-center sm:w-48 sm:flex-col sm:items-stretch">
              <span className={`rounded-full border px-2.5 py-1 text-center text-[10px] font-semibold ${verificationClass(verification)}`}>{verificationLoading && !verification ? 'Carregando estado…' : verificationLabel(verification)}</span>
              <a href={verification?.officialUrl || portalUrl(effectiveCode)} target="_blank" rel="noreferrer" className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-center text-xs font-semibold text-[#1d4f91]">Verificar no portal Husqvarna</a>
              <button type="button" onClick={() => void copyCode(effectiveCode)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#1d4f91]">Copiar código</button>
              <button type="button" onClick={() => void openPart(part.id)} disabled={opening} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500">{opening ? 'Abrindo…' : 'Ver detalhes'}</button>
              {admin && <button type="button" onClick={() => beginVerification(part)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Registrar verificação</button>}
            </div>
          </article>;
        })}{!parts.length && <div className="p-8 text-center text-sm text-slate-400">{hasSearched ? 'Nenhuma peça encontrada.' : 'Pronto para pesquisar.'}</div>}</div>}
      </div>

      <aside className="cv-surface h-fit rounded-[22px] p-5"><div className="font-semibold">Catálogos relacionados</div><div className="mt-4 grid gap-2">{documents.map(document => <div key={document.id} className="rounded-xl border border-slate-200 p-3"><div className="truncate text-sm font-semibold">{document.filename}</div><div className="mt-1 text-xs text-slate-400">{document.model || 'Modelo não informado'} · PNC {document.pnc || '—'} · {document.partCount} peças</div><button type="button" onClick={() => void accessPdf(document.id, null, document.filename)} className="mt-3 text-xs font-semibold text-[#1d4f91]">Abrir catálogo →</button></div>)}{!documents.length && <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-400">Os catálogos associados aparecerão aqui.</div>}</div></aside>
    </div>

    {detail && <div onMouseDown={closeDetailFromBackdrop} className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 md:items-center md:p-6"><div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-t-[28px] bg-white shadow-2xl md:rounded-[28px]">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4"><div><div className="text-xs font-bold uppercase tracking-[.12em] text-[#1d4f91]">Detalhe da peça</div><div className="mt-1 text-lg font-semibold">{detail.name}</div></div><button type="button" onClick={() => setDetail(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">Fechar</button></div>
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div><div className="rounded-[22px] bg-[#0d2348] p-6 text-white"><div className="text-xs text-slate-400">Código da peça</div><div className="mt-2 break-all text-3xl font-semibold">{detailVerification?.state === 'SUPERSEDED' ? `${detail.partNumber} → ${detailVerification.currentPartNumber}` : detail.partNumber}</div><div className="mt-5 flex flex-wrap gap-2"><a href={detailVerification?.officialUrl || portalUrl(detail.partNumber)} target="_blank" rel="noreferrer" className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#0d2348]">Verificar no portal Husqvarna</a><button type="button" onClick={() => void toggleFavorite()} className="rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold">{detail.favoriteId ? '★ Favoritada' : '☆ Favoritar'}</button><button type="button" onClick={() => void accessPdf(detail.documentId, detail.page, detail.filename)} className="rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold">Abrir no catálogo</button></div></div>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-[18px] border border-slate-200 p-4"><div><div className="text-xs font-semibold text-slate-500">Estado da verificação</div><div className="mt-1 text-sm font-semibold">{verificationLabel(detailVerification)}</div>{detailVerification?.state === 'SUPERSEDED' && <div className="mt-1 text-xs text-blue-700">{detailVerification.queriedPartNumber} → {detailVerification.currentPartNumber}</div>}</div>{admin && <button type="button" onClick={() => beginVerification(detail)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">Atualizar verificação</button>}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><Info label="Modelo" value={detail.model}/><Info label="PNC" value={detail.pnc || '—'}/><Info label="Seção" value={detail.section || '—'}/><Info label="Posição / página" value={`${detail.position || '—'} · pág. ${detail.page ?? '—'}`}/></div>
          {detail.notes && <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{detail.notes}</div>}
          <div className="mt-5"><div className="font-semibold">Compatibilidade encontrada</div><div className="mt-3 flex flex-wrap gap-2">{detail.compatibility.map((item, index) => <span key={`${item.model}-${item.pnc}-${index}`} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800">{item.model} · PNC {item.pnc || '—'}</span>)}</div></div>
        </div>
        <div><div className="rounded-[22px] border border-slate-200 p-4"><div className="text-xs uppercase tracking-[.1em] text-slate-400">Fonte técnica</div><div className="mt-2 break-words text-sm font-semibold">{detail.filename}</div></div><div className="mt-4 rounded-[22px] border border-slate-200 p-4"><div className="font-semibold">Peças relacionadas</div><div className="mt-3 grid gap-2">{detail.related.map(item => <button key={item.id} type="button" onClick={() => void openPart(item.id)} className="rounded-xl bg-slate-50 p-3 text-left"><div className="text-xs font-semibold">{item.name}</div><div className="mt-1 text-xs text-slate-400">{item.partNumber} · posição {item.position || '—'}</div></button>)}</div></div></div>
      </div>
    </div></div>}

    {form && admin && <div className="fixed inset-0 z-[85] grid place-items-center bg-slate-950/50 p-4"><form onSubmit={saveVerification} className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-[24px] bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><div><div className="text-xs font-bold uppercase tracking-[.12em] text-[#1d4f91]">Administrador</div><h2 className="mt-1 text-xl font-semibold">Verificação oficial Husqvarna</h2></div><button type="button" onClick={() => setForm(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">Fechar</button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Estado<select value={form.status} onChange={event => setForm(current => current ? { ...current, status: event.target.value as VerificationForm['status'] } : current)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"><option value="VERIFIED">Verificado oficialmente</option><option value="SUPERSEDED">Código substituído</option><option value="REVIEW">Precisa de revisão</option></select></label><label className="text-xs font-semibold text-slate-600">Data da verificação<input type="datetime-local" value={form.verifiedAt} onChange={event => setForm(current => current ? { ...current, verifiedAt: event.target.value } : current)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"/></label><label className="text-xs font-semibold text-slate-600">Código consultado / antigo<input value={form.queriedPartNumber} onChange={event => setForm(current => current ? { ...current, queriedPartNumber: event.target.value } : current)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"/></label><label className="text-xs font-semibold text-slate-600">Código atual<input value={form.currentPartNumber} onChange={event => setForm(current => current ? { ...current, currentPartNumber: event.target.value, officialUrl: portalUrl(event.target.value) } : current)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"/></label></div>
      <label className="mt-4 block text-xs font-semibold text-slate-600">Descrição<input value={form.description} onChange={event => setForm(current => current ? { ...current, description: event.target.value } : current)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"/></label><label className="mt-4 block text-xs font-semibold text-slate-600">URL oficial<input value={form.officialUrl} readOnly className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500"/></label><label className="mt-4 block text-xs font-semibold text-slate-600">Observação<textarea value={form.note} onChange={event => setForm(current => current ? { ...current, note: event.target.value } : current)} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"/></label>
      <div className="mt-5 flex flex-wrap justify-between gap-3"><a href={form.officialUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-[#1d4f91]">Abrir Portal Husqvarna</a><button type="submit" disabled={savingVerification} className="cv-primary px-5 py-2.5 text-sm font-semibold">{savingVerification ? 'Registrando…' : 'Confirmar registro oficial'}</button></div>
    </form></div>}

    {pdf && <div onMouseDown={closePdfFromBackdrop} className="fixed inset-0 z-[90] bg-slate-950/90 p-3 md:p-6"><div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-[22px] bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><div className="text-sm font-semibold">{pdf.title}</div><div className="text-xs text-slate-400">{pdf.page ? `Página ${pdf.page}` : 'Visualização do catálogo'}</div></div><button type="button" onClick={() => setPdf(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">Fechar</button></div><iframe title={pdf.title} src={`${pdf.url}${pdf.page ? `#page=${pdf.page}` : ''}`} className="h-full w-full border-0"/></div></div>}
  </section>;
}
