import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiJson } from '../lib';
import { useConfirm } from '../context/confirm';
import { PriceListFileError, extractPriceListPayload, gzipJson } from '../lib/price-list-file';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type ReportRow = { partNumber: string; name: string; before: number | null; after: number; percent: number | null };

type Report = {
  divisor: number;
  file: { rows: number; uniqueCodes: number; rowsWithoutCode: number; rowsWithBadPrice: number };
  rejected: Array<{ normalizedNumber: string; prices: number[] }>;
  resolved: Array<{ normalizedNumber: string; chosen: number; ignored: number[] }>;
  stored: number;
  unchanged: number;
  changed: number;
  added: number;
  missingFromList: number;
  buckets: Array<{ label: string; count: number }>;
  topIncreases: ReportRow[];
  topDrops: ReportRow[];
  addedBySection: Array<{ label: string; count: number }>;
  /** Peças de revisão por máquina. `incoming` 0 = a lista não traz o campo (lista antiga): nada muda. */
  service: { stored: number; incoming: number; added: number; removed: number; machines: number };
};

type Prepared = { filename: string; body: Blob; fileHash: string; report: Report };

type Phase =
  | { name: 'idle' }
  | { name: 'reading' | 'checking' }
  | { name: 'ready'; prepared: Prepared }
  | { name: 'saving'; prepared: Prepared }
  | { name: 'done'; updated: number; added: number; service: number };

const OCTET = { 'Content-Type': 'application/octet-stream' };
const serviceChanges = (report: Report) => report.service.added > 0 || report.service.removed > 0;
const number = (value: number) => value.toLocaleString('pt-BR');
const brl = (value: number | null) => (value === null ? '—' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const percent = (value: number | null) => (value === null ? '' : `${value > 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')}%`);

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-md border border-border px-4 py-3">
      <div className="text-2xl font-bold tabular-nums">{number(value)}</div>
      <div className="text-base font-semibold">{label}</div>
      {note && <div className="text-sm text-muted-foreground">{note}</div>}
    </div>
  );
}

function ChangesTable({ title, rows }: { title: string; rows: ReportRow[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <h3 className="mb-1 text-base font-semibold">{title}</h3>
      <Table containerClassName="rounded-md border border-border bg-transparent">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Peça</TableHead>
            <TableHead className="text-right">Antes</TableHead>
            <TableHead className="text-right">Depois</TableHead>
            <TableHead className="text-right">Variação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.partNumber}>
              <TableCell>
                <div className="max-w-[24rem] truncate font-semibold" title={row.name}>{row.name}</div>
                <div translate="no" className="font-code text-sm text-muted-foreground">{row.partNumber}</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{brl(row.before)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{brl(row.after)}</TableCell>
              <TableCell className="text-right tabular-nums">{percent(row.percent)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Atualização da lista de preços da Husqvarna pela tela do administrador (Negócio).
 *
 * O arquivo .html é lido AQUI, no navegador, e só as quatro listas de preços seguem comprimidas (lib/price-list-file.ts). O servidor compara com a loja e
 * devolve o relatório; só depois do "Gravar" (com os números aprovados) ele escreve, numa transação única, e recusa se os números mudaram. Nunca apaga nada.
 */
export default function PriceListUpdate() {
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const reset = () => {
    setPhase({ name: 'idle' });
    setError(null);
    if (input.current) input.current.value = '';
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Limpa o campo já: escolher o MESMO arquivo outra vez (depois de gravar, ou de corrigir algo) só dispara `change` se o valor mudou.
    event.target.value = '';
    if (!file) return;
    setError(null);
    setPhase({ name: 'reading' });
    try {
      const body = await gzipJson(extractPriceListPayload(await file.text()));
      setPhase({ name: 'checking' });
      const result = await apiJson<{ fileHash: string; report: Report }>('/api/admin/price-list/preview', {
        method: 'POST', headers: OCTET, body, timeoutMs: 120_000,
      });
      setPhase({ name: 'ready', prepared: { filename: file.name, body, fileHash: result.fileHash, report: result.report } });
    } catch (caught) {
      setError(caught instanceof PriceListFileError || caught instanceof Error ? caught.message : 'Não foi possível ler o arquivo.');
      setPhase({ name: 'idle' });
    }
  };

  const save = async (prepared: Prepared) => {
    const { report } = prepared;
    const confirmed = await confirm({
      title: 'Gravar a lista na loja?',
      description: serviceChanges(report)
        ? `${number(report.changed)} preços serão atualizados, ${number(report.added)} códigos novos serão criados e a lista de peças de revisão será trocada (${number(report.service.incoming)} peças em ${number(report.service.machines)} máquinas). Nenhuma peça nem preço é apagado.`
        : `${number(report.changed)} preços serão atualizados e ${number(report.added)} códigos novos serão criados. Nada é apagado.`,
      confirmLabel: 'Gravar',
    });
    if (!confirmed) return;
    setError(null);
    setPhase({ name: 'saving', prepared });
    try {
      const query = new URLSearchParams({
        changed: String(report.changed), added: String(report.added),
        serviceAdded: String(report.service.added), serviceRemoved: String(report.service.removed),
        hash: prepared.fileHash, filename: prepared.filename,
      });
      const result = await apiJson<{ updated: number; added: number; serviceAdded: number }>(`/api/admin/price-list/apply?${query}`, {
        method: 'POST', headers: OCTET, body: prepared.body, timeoutMs: 300_000,
      });
      void queryClient.invalidateQueries();
      setPhase({ name: 'done', updated: result.updated, added: result.added, service: result.serviceAdded });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível gravar. Nada foi gravado.');
      setPhase({ name: 'ready', prepared });
    }
  };

  const busy = phase.name === 'reading' || phase.name === 'checking' || phase.name === 'saving';
  const prepared = phase.name === 'ready' || phase.name === 'saving' ? phase.prepared : null;
  const report = prepared?.report ?? null;

  return (
    <section aria-label="Atualizar a lista de preços" className="overflow-hidden rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">Atualizar a lista de preços</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Escolha o arquivo .html da Husqvarna. Você confere o que muda antes de gravar.</p>
        </div>
        <div>
          <input ref={input} id="price-list-file" type="file" accept=".html,.htm,text/html" className="sr-only" onChange={event => void onFile(event)} disabled={busy} />
          {(phase.name === 'idle' || phase.name === 'done') && <Button type="button" onClick={() => input.current?.click()}>Escolher o arquivo</Button>}
          {(phase.name === 'ready') && <Button type="button" variant="outline" onClick={reset}>Escolher outro arquivo</Button>}
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {error && <p role="alert" className="text-base text-destructive">{error}</p>}
        {phase.name === 'reading' && <p role="status" className="text-base text-muted-foreground">Lendo o arquivo…</p>}
        {phase.name === 'checking' && <p role="status" className="text-base text-muted-foreground">Comparando com a loja…</p>}
        {phase.name === 'saving' && <p role="status" className="text-base text-muted-foreground">Gravando…</p>}
        {phase.name === 'done' && (
          <p role="status" className="text-base font-semibold text-ok">
            Pronto: {number(phase.updated)} preços atualizados e {number(phase.added)} códigos novos{phase.service > 0 ? `, e a lista de peças de revisão foi atualizada` : ''}.
          </p>
        )}
        {phase.name === 'idle' && !error && <p className="text-base text-muted-foreground">Nenhum arquivo escolhido.</p>}

        {report && prepared && (
          <>
            <p className="text-base"><span className="font-semibold">{prepared.filename}</span> · {number(report.file.uniqueCodes)} códigos · a loja tem {number(report.stored)}</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Preços que mudam" value={report.changed} />
              <Stat label="Códigos novos" value={report.added} />
              <Stat label="Já estão iguais" value={report.unchanged} />
              <Stat label="Só na loja" value={report.missingFromList} note="ficam como estão" />
            </div>
            {report.service.incoming > 0 && (
              <p className="text-base">
                <span className="font-semibold">Peças de revisão:</span> {number(report.service.incoming)} peças em {number(report.service.machines)} máquinas
                {serviceChanges(report)
                  ? ` (${number(report.service.added)} novas, ${number(report.service.removed)} saem)`
                  : ' (já estão iguais)'}
              </p>
            )}

            {report.rejected.length > 0 && (
              <div role="alert" className="rounded-md border border-warn px-4 py-3 text-base">
                <div className="font-semibold">{number(report.rejected.length)} {report.rejected.length === 1 ? 'código recusado' : 'códigos recusados'}: o arquivo traz mais de um preço</div>
                <ul className="mt-1 font-code text-sm">
                  {report.rejected.slice(0, 8).map(item => (
                    <li key={item.normalizedNumber} translate="no">{item.normalizedNumber}: {item.prices.map(brl).join(' / ')}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.resolved.length > 0 && (
              <p className="text-base text-muted-foreground">
                Preço decidido por você:{' '}
                {report.resolved.map(item => (
                  <span key={item.normalizedNumber} translate="no" className="font-code">
                    {item.normalizedNumber} → {brl(item.chosen)} (o arquivo também traz {item.ignored.map(brl).join(' / ')}, ignorado)
                  </span>
                ))}
              </p>
            )}
            {(report.file.rowsWithoutCode > 0 || report.file.rowsWithBadPrice > 0) && (
              <p className="text-sm text-muted-foreground">
                Linhas ignoradas: {number(report.file.rowsWithoutCode)} sem código e {number(report.file.rowsWithBadPrice)} com preço fora do padrão.
              </p>
            )}

            {report.buckets.some(bucket => bucket.count > 0) && (
              <ul className="flex flex-wrap gap-2">
                {report.buckets.filter(bucket => bucket.count > 0).map(bucket => (
                  <li key={bucket.label} className="rounded-sm bg-muted px-2 py-1 text-sm">{bucket.label}: <span className="font-semibold tabular-nums">{number(bucket.count)}</span></li>
                ))}
              </ul>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
              <ChangesTable title="Maiores aumentos" rows={report.topIncreases.slice(0, 8)} />
              <ChangesTable title="Maiores quedas" rows={report.topDrops.slice(0, 8)} />
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button type="button" size="lg" disabled={busy || (report.changed === 0 && report.added === 0 && !serviceChanges(report))} onClick={() => void save(prepared)}>Gravar na loja</Button>
              {report.changed === 0 && report.added === 0 && !serviceChanges(report) && <span className="text-base text-muted-foreground">A loja já está igual a esta lista.</span>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
