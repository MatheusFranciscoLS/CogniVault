import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { apiJson } from '../lib';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_BATCH_FILES = 50;
const UPLOAD_CONCURRENCY = 2;

type UploadState = 'READY' | 'UPLOADING' | 'QUEUED' | 'DUPLICATE' | 'FAILED';

type UploadItem = {
  id: string;
  file: File;
  state: UploadState;
  message?: string;
  documentId?: string;
};

type Props = {
  onComplete: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function fileIdentity(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function itemId(file: File, index: number): string {
  return `${fileIdentity(file)}|${Date.now()}|${index}`;
}

function clipboardFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const directFiles = Array.from(data.files || []);
  if (directFiles.length) return directFiles;
  return Array.from(data.items || [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

function statusLabel(item: UploadItem): string {
  if (item.state === 'UPLOADING') return 'Enviando…';
  if (item.state === 'QUEUED') return 'Na fila de processamento';
  if (item.state === 'DUPLICATE') return 'Já cadastrado';
  if (item.state === 'FAILED') return 'Falhou';
  return 'Pronto para enviar';
}

function statusClass(state: UploadState): string {
  if (state === 'QUEUED') return 'bg-emerald-50 text-emerald-700';
  if (state === 'UPLOADING') return 'bg-amber-50 text-amber-700';
  if (state === 'DUPLICATE') return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400';
  if (state === 'FAILED') return 'bg-rose-50 text-rose-700';
  return 'bg-blue-50 dark:bg-[#123867] text-blue-700';
}

export default function BatchCatalogUploader({ onComplete, onNotice, onError }: Props) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [pnc, setPnc] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const patchItem = (id: string, patch: Partial<UploadItem>) => {
    setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const addFiles = useCallback((files: File[]) => {
    const existing = new Set(items.map(item => fileIdentity(item.file)));
    const accepted: File[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        rejected.push(`${file.name}: não é PDF`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name}: excede 50 MB`);
        continue;
      }
      const identity = fileIdentity(file);
      if (existing.has(identity) || accepted.some(candidate => fileIdentity(candidate) === identity)) continue;
      accepted.push(file);
    }

    const availableSlots = Math.max(0, MAX_BATCH_FILES - items.length);
    const selected = accepted.slice(0, availableSlots);
    if (accepted.length > availableSlots) rejected.push(`o lote aceita no máximo ${MAX_BATCH_FILES} PDFs por vez`);

    if (selected.length) {
      setItems(current => [
        ...current,
        ...selected.map((file, index) => ({ id: itemId(file, index), file, state: 'READY' as const })),
      ]);
    }

    if (rejected.length) onError(`Alguns arquivos foram ignorados: ${rejected.slice(0, 4).join(' · ')}${rejected.length > 4 ? '…' : ''}`);
    else if (selected.length) onError('');
  }, [items, onError]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (busy) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;

      const files = clipboardFiles(event.clipboardData);
      const pdfCount = files.filter(file => file.name.toLowerCase().endsWith('.pdf')).length;
      if (!pdfCount) return;

      event.preventDefault();
      addFiles(files);
      onNotice(`${pdfCount} PDF${pdfCount === 1 ? '' : 's'} adicionado${pdfCount === 1 ? '' : 's'} pelo Ctrl+V.`);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addFiles, busy, onNotice]);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  const removeItem = (id: string) => {
    if (busy) return;
    setItems(current => current.filter(item => item.id !== id));
  };

  const clearFinished = () => {
    if (busy) return;
    setItems(current => current.filter(item => !['QUEUED', 'DUPLICATE'].includes(item.state)));
  };

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    const pending = items.filter(item => item.state === 'READY' || item.state === 'FAILED');
    if (!pending.length) {
      onError('Adicione pelo menos um PDF novo para importar.');
      return;
    }

    setBusy(true);
    onError('');
    const applyManualMetadata = items.length === 1;
    let cursor = 0;
    let queued = 0;
    let duplicates = 0;
    let failed = 0;

    const worker = async () => {
      while (cursor < pending.length) {
        const entry = pending[cursor];
        cursor += 1;
        patchItem(entry.id, { state: 'UPLOADING', message: undefined });

        const form = new FormData();
        form.append('file', entry.file);
        if (applyManualMetadata) {
          if (manufacturer.trim()) form.append('manufacturer', manufacturer.trim());
          if (model.trim()) form.append('model', model.trim());
          if (pnc.trim()) form.append('pnc', pnc.trim());
        }

        try {
          const response = await apiJson<{ document: { id: string } }>('/api/upload', {
            method: 'POST',
            body: form,
            timeoutMs: 120_000,
          });
          queued += 1;
          patchItem(entry.id, { state: 'QUEUED', documentId: response.document.id });
        } catch (uploadError) {
          const message = uploadError instanceof Error ? uploadError.message : 'Erro no upload.';
          if (/mesmo pdf|já está cadastrado|ja esta cadastrado/i.test(message)) {
            duplicates += 1;
            patchItem(entry.id, { state: 'DUPLICATE', message });
          } else {
            failed += 1;
            patchItem(entry.id, { state: 'FAILED', message });
          }
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, pending.length) }, () => worker()));
      await onComplete();
      const summary = [
        queued ? `${queued} enviado${queued === 1 ? '' : 's'}` : '',
        duplicates ? `${duplicates} duplicado${duplicates === 1 ? '' : 's'}` : '',
        failed ? `${failed} com falha` : '',
      ].filter(Boolean).join(' · ');
      onNotice(summary || 'Importação concluída.');
      if (failed) onError('Alguns PDFs não foram enviados. Você pode tentar novamente somente os itens marcados como falha.');
      if (applyManualMetadata && queued) {
        setManufacturer('');
        setModel('');
        setPnc('');
      }
    } finally {
      setBusy(false);
    }
  };

  const readyCount = items.filter(item => item.state === 'READY' || item.state === 'FAILED').length;
  const finishedCount = items.filter(item => item.state === 'QUEUED' || item.state === 'DUPLICATE').length;

  return <form onSubmit={upload} className="cv-surface mb-6 rounded-[22px] p-5">
    <div className="mb-1 font-semibold">Importar catálogos em lote</div>
    <p className="mb-4 text-xs leading-5 text-slate-400">
      Adicione até {MAX_BATCH_FILES} PDFs por vez. Não é necessário renomear os arquivos: modelo e PNC são identificados pelo conteúdo de cada catálogo.
    </p>

    <div
      role="button"
      tabIndex={0}
      onClick={() => !busy && inputRef.current?.click()}
      onKeyDown={event => { if (!busy && (event.key === 'Enter' || event.key === ' ')) inputRef.current?.click(); }}
      onDragEnter={event => { event.preventDefault(); if (!busy) setDragActive(true); }}
      onDragOver={event => event.preventDefault()}
      onDragLeave={event => { event.preventDefault(); if (event.currentTarget === event.target) setDragActive(false); }}
      onDrop={handleDrop}
      className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition ${dragActive ? 'border-slate-500 bg-slate-50 dark:bg-slate-800/50' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:border-slate-600'} ${busy ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input
        ref={inputRef}
        aria-label="Arquivos PDF"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={event => {
          addFiles(Array.from(event.target.files || []));
          event.target.value = '';
        }}
      />
      <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">{dragActive ? 'Solte os PDFs aqui' : 'Clique, arraste os PDFs ou cole com Ctrl+V'}</div>
      <div className="mt-2 flex flex-wrap justify-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <span className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-1">Selecionar PDFs</span>
        <span className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-1">Arrastar e soltar</span>
        <span className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-1">Ctrl+V</span>
      </div>
      <div className="mt-2 text-xs text-slate-400">Até {MAX_BATCH_FILES} PDFs · máximo de 50 MB por arquivo · duplicados detectados pelo conteúdo</div>
    </div>

    {items.length === 1 && <div className="mt-4 grid gap-3 md:grid-cols-3">
      <input aria-label="Fabricante" value={manufacturer} onChange={event => setManufacturer(event.target.value)} placeholder="Fabricante (opcional)" className="cv-field text-sm" />
      <input aria-label="Modelo" value={model} onChange={event => setModel(event.target.value)} placeholder="Modelo (opcional)" className="cv-field text-sm" />
      <input aria-label="PNC" value={pnc} onChange={event => setPnc(event.target.value)} placeholder="PNC (opcional)" className="cv-field text-sm" />
    </div>}

    {items.length > 1 && <div className="mt-4 rounded-xl border border-blue-100 dark:border-blue-700 bg-blue-50 dark:bg-[#123867]/70 px-3 py-2 text-xs leading-5 text-blue-700">
      Modo automático do lote: fabricante, modelo e PNC serão extraídos de cada PDF individualmente.
    </div>}

    {items.length > 0 && <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
        <span>{items.length} arquivo{items.length === 1 ? '' : 's'} no lote</span>
        {finishedCount > 0 && <button type="button" disabled={busy} onClick={clearFinished} className="font-medium text-slate-600 dark:text-slate-400 disabled:opacity-40">Limpar concluídos</button>}
      </div>
      <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
        {items.map(item => <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 text-xs">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-slate-700 dark:text-slate-300">{item.file.name}</div>
            <div className="mt-0.5 text-[10px] text-slate-400">{(item.file.size / 1024 / 1024).toFixed(1)} MB{item.message ? ` · ${item.message}` : ''}</div>
          </div>
          <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(item.state)}`}>{statusLabel(item)}</span>
          {!busy && item.state !== 'UPLOADING' && <button type="button" onClick={() => removeItem(item.id)} aria-label={`Remover ${item.file.name}`} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:bg-slate-700 hover:text-slate-700 dark:text-slate-300">×</button>}
        </div>)}
      </div>
    </div>}

    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button disabled={busy || readyCount === 0} className="cv-primary px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
        {busy ? 'Importando…' : readyCount > 1 ? `Importar ${readyCount} PDFs` : 'Importar PDF'}
      </button>
      {items.length > 0 && !busy && <button type="button" onClick={() => setItems([])} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400">Limpar lote</button>}
    </div>
  </form>;
}
