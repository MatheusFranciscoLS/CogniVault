import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { apiJson } from '../lib';
import { useConfirm } from '../context/confirm';
import {
  FILES_PER_BATCH,
  bytesToBase64,
  chunk,
  selectImportable,
  summarizeEntries,
  type ImportEntry,
} from '../lib/repair-import';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Selection = ReturnType<typeof selectImportable<File>>;
type Phase =
  | { name: 'idle' }
  | { name: 'picked'; selection: Selection }
  | { name: 'reading'; selection: Selection; done: number }
  | { name: 'ready'; selection: Selection; entries: ImportEntry[]; batchOk: number[] }
  | { name: 'saving'; selection: Selection; entries: ImportEntry[]; batchOk: number[]; done: number }
  | { name: 'done'; created: number }
  | { name: 'error'; message: string };

const number = (value: number) => value.toLocaleString('pt-BR');
const w = (value: number, one: string, many: string) => (value === 1 ? one : many);

async function batchBody(files: File[]) {
  const encoded = await Promise.all(files.map(async file => ({ name: file.name, modifiedAt: file.lastModified, data: bytesToBase64(new Uint8Array(await file.arrayBuffer())) })));
  return JSON.stringify({ files: encoded });
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Importa os orçamentos de conserto antigos (planilhas "ORÇAMENTO DAV ####.xlsx") para a pasta. Só administrador. Lê em lotes (o servidor lê as planilhas e
 * devolve um relatório), mostra os números, e só grava depois da confirmação, com os mesmos números aprovados. Nunca apaga nem troca uma OS que já existe.
 */
export default function RepairImport({ onFinished }: { onFinished: () => void }) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const folderRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    if (phase.name === 'done') onFinished();
    setPhase({ name: 'idle' });
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setPhase({ name: 'picked', selection: selectImportable(files) });
  };

  const read = async (selection: Selection) => {
    const batches = chunk(selection.send, FILES_PER_BATCH);
    const entries: ImportEntry[] = [];
    const batchOk: number[] = [];
    try {
      for (const [index, files] of batches.entries()) {
        setPhase({ name: 'reading', selection, done: index * FILES_PER_BATCH });
        const report = await apiJson<{ entries: ImportEntry[] }>('/api/admin/repair-import/preview', { method: 'POST', headers: JSON_HEADERS, body: await batchBody(files), timeoutMs: 60_000 });
        entries.push(...report.entries);
        batchOk.push(report.entries.filter(entry => entry.status === 'OK').length);
      }
      setPhase({ name: 'ready', selection, entries, batchOk });
    } catch (error) {
      setPhase({ name: 'error', message: error instanceof Error ? error.message : 'Não foi possível ler as planilhas.' });
    }
  };

  const save = async (state: Extract<Phase, { name: 'ready' }>) => {
    const totals = summarizeEntries(state.entries);
    const ok = await confirm({
      title: `Gravar ${number(totals.ok)} ${w(totals.ok, 'orçamento', 'orçamentos')} na pasta de conserto?`,
      description: 'Nenhuma OS que já existe é apagada ou trocada. Os orçamentos entram sem cliente, com a data do arquivo.',
      confirmLabel: 'Gravar',
    });
    if (!ok) return;
    const batches = chunk(state.selection.send, FILES_PER_BATCH);
    let created = 0;
    try {
      for (const [index, files] of batches.entries()) {
        setPhase({ name: 'saving', selection: state.selection, entries: state.entries, batchOk: state.batchOk, done: index * FILES_PER_BATCH });
        const expected = state.batchOk[index] ?? 0;
        // Lote sem nada a gravar (tudo já existe ou não serve) não precisa ir.
        if (expected === 0) continue;
        const result = await apiJson<{ created: number }>(`/api/admin/repair-import/apply?expect=${expected}`, { method: 'POST', headers: JSON_HEADERS, body: await batchBody(files), timeoutMs: 90_000 });
        created += result.created;
      }
      setPhase({ name: 'done', created });
    } catch (error) {
      setPhase({ name: 'error', message: `${error instanceof Error ? error.message : 'Não foi possível gravar.'} O que já foi gravado fica na pasta; escolha a pasta de novo para continuar (o que já existe é pulado).` });
    }
  };

  const busy = phase.name === 'reading' || phase.name === 'saving';

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>Importar antigos</Button>
      {/* O seletor de pasta mora fora do diálogo para o Playwright e o teclado acharem sempre. */}
      <Dialog open={open} onOpenChange={next => { if (!next && !busy) close(); }}>
        <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Importar orçamentos de conserto antigos</DialogTitle>
            <DialogDescription className="sr-only">Escolha a pasta com as planilhas ORÇAMENTO DAV, confira o relatório e grave.</DialogDescription>
          </DialogHeader>

          {phase.name === 'idle' && (
            <div className="space-y-3">
              <Button type="button" size="lg" onClick={() => folderRef.current?.click()}>Escolher a pasta</Button>
              <input
                ref={folderRef}
                type="file"
                multiple
                // @ts-expect-error webkitdirectory não está nos tipos do React, mas todo navegador de PC aceita
                webkitdirectory=""
                aria-label="Pasta com as planilhas ORÇAMENTO DAV"
                className="sr-only"
                onChange={onPick}
              />
              <input type="file" multiple accept=".xls,.xlsx" aria-label="Planilhas ORÇAMENTO DAV" className="block w-full text-sm" onChange={onPick} />
            </div>
          )}

          {phase.name === 'picked' && (
            <div className="space-y-3">
              <p className="text-base">
                {number(phase.selection.send.length)} {w(phase.selection.send.length, 'planilha com número de OS', 'planilhas com número de OS')}
                {phase.selection.repeated > 0 && <> · {number(phase.selection.repeated)} {w(phase.selection.repeated, 'repetida (vale a mais nova)', 'repetidas (vale a mais nova)')}</>}
              </p>
              <p className="text-sm text-muted-foreground">
                Fora da conta: {number(phase.selection.temporary)} {w(phase.selection.temporary, 'temporário do Excel', 'temporários do Excel')}, {number(phase.selection.noNumber)} sem número de OS no nome, {number(phase.selection.notSpreadsheet)} que não {w(phase.selection.notSpreadsheet, 'é planilha', 'são planilhas')}.
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPhase({ name: 'idle' })}>Trocar a pasta</Button>
                <Button type="button" disabled={phase.selection.send.length === 0} onClick={() => void read(phase.selection)}>Ler as planilhas</Button>
              </DialogFooter>
            </div>
          )}

          {(phase.name === 'reading' || phase.name === 'saving') && (
            <p role="status" className="text-base">
              {phase.name === 'reading' ? 'Lendo' : 'Gravando'} {number(Math.min(phase.done, phase.selection.send.length))} de {number(phase.selection.send.length)}…
            </p>
          )}

          {phase.name === 'ready' && (() => {
            const totals = summarizeEntries(phase.entries);
            return (
              <div className="space-y-3">
                <p className="text-lg font-semibold">{number(totals.ok)} {w(totals.ok, 'orçamento pronto para gravar', 'orçamentos prontos para gravar')}</p>
                <ul className="space-y-1 text-base">
                  <li>{number(totals.exists)} {w(totals.exists, 'já está na pasta (não é trocado)', 'já estão na pasta (não são trocados)')}</li>
                  {totals.skipped > 0 && <li>{number(totals.skipped)} {w(totals.skipped, 'arquivo de fora', 'arquivos de fora')}</li>}
                  <li>{number(totals.problems)} {w(totals.problems, 'com problema (não entra)', 'com problema (não entram)')}</li>
                </ul>
                {totals.warnings.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Entram, mas confira:</p>
                    <ul className="text-base">{totals.warnings.map(item => <li key={item.label}>{number(item.count)} {item.label}</li>)}</ul>
                  </div>
                )}
                {totals.problemList.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-base font-medium">Ver os {number(totals.problemList.length)} com problema</summary>
                    <ul className="mt-1 max-h-40 overflow-y-auto text-sm">{totals.problemList.slice(0, 60).map(item => <li key={item.name}>{item.name}: {item.reason}</li>)}</ul>
                  </details>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setPhase({ name: 'idle' })}>Trocar a pasta</Button>
                  <Button type="button" disabled={totals.ok === 0} onClick={() => void save(phase)}>Gravar {number(totals.ok)}</Button>
                </DialogFooter>
              </div>
            );
          })()}

          {phase.name === 'done' && (
            <div className="space-y-3">
              <p role="status" className="text-lg font-semibold">{number(phase.created)} {w(phase.created, 'orçamento gravado', 'orçamentos gravados')} na pasta.</p>
              <DialogFooter><Button type="button" onClick={close}>Fechar</Button></DialogFooter>
            </div>
          )}

          {phase.name === 'error' && (
            <div className="space-y-3">
              <p role="alert" className="text-base text-warn">{phase.message}</p>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setPhase({ name: 'idle' })}>Voltar</Button></DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
