import { useState } from 'react';
import PageFrame from './PageFrame';
import { BAND_FIELD } from '../lib/band-field';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { categoryLabel } from '../lib/category-label';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiJson, formatEngineOrCatalogModel } from '../lib';
import type { DocumentItem } from '../types';
import CatalogsPanel from './CatalogsPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type CatalogData = { documents: DocumentItem[]; categories: string[] };


type Props = {
  admin: boolean;
  onQuality?: () => void;
  initialSearch?: string;
  onSearch?: (query: string) => void;
};

function clean(value: string | null | undefined) {
  const normalized = (value ?? '').trim();
  return normalized === 'null' || normalized === 'undefined' ? '' : normalized;
}

async function loadCatalogs(): Promise<CatalogData> {
  const documentsData = await apiJson<{ documents: DocumentItem[]; categories: string[] }>('/api/documents');
  return { documents: documentsData.documents, categories: documentsData.categories || [] };
}

/** Só o que foge do normal aparece: catálogo pronto não precisa dizer que está pronto. */
function problemLabel(document: DocumentItem): { text: string; tone: 'warn' | 'bad' } | null {
  if (document.processingActive || document.status === 'PROCESSING' || document.status === 'PENDING') return { text: 'Processando', tone: 'warn' };
  if (document.status === 'FAILED') return { text: 'Falhou', tone: 'bad' };
  return null;
}

/**
 * PDF de motor de TERCEIRO (Briggs, Kawasaki, Kohler). Sai da lista de Catálogos do balcão (dono, 2026-10-08: "faz sentido esse catálogo estar aí em PDF
 * se pode ser procurado normalmente?"): o Atendimento abre o catálogo oficial do motor, com vista explodida, código, preço e "+ Orçamento", e os botões
 * antigos desta lista levavam a sites externos ou a uma rota de PDF. Nada é apagado: o PDF e as peças lidas dele continuam na Biblioteca (Gerenciar
 * biblioteca) e na busca; quem quiser tirá-los de vez arquiva ou exclui por lá.
 */
function isThirdPartyEngineCatalog(document: DocumentItem) {
  return Boolean(document.briggsEngineModel || document.kawasakiEngineModel || /briggs|stratton|kawasaki|kohler/i.test(document.manufacturer ?? ''));
}

/** O que digitar no Atendimento para abrir o catálogo oficial daquele motor. */
function engineSearchTerm(document: DocumentItem) {
  return document.briggsEngineModel || document.kawasakiEngineModel || clean(document.model) || document.filename;
}

function catalogPncs(document: DocumentItem) {
  return [...new Set([...(document.pncs || []), document.pnc || ''].map(value => value.trim()).filter(Boolean))];
}

export default function CatalogsWorkspace({ admin, onQuality, initialSearch, onSearch }: Props) {
  const [search, setSearch] = useState(() => clean(initialSearch));
  const [category, setCategory] = useState('ALL');
  const [managementOpen, setManagementOpen] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; title: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['catalog-workspace'],
    queryFn: loadCatalogs,
    refetchInterval: query => (query.state.data?.documents || []).some(document => document.processingActive || ['PENDING', 'PROCESSING'].includes(document.status)) ? 8000 : false,
  });

  const documents = (data?.documents || []).filter(document => !document.archivedAt);
  const categories = data?.categories || [];
  const normalized = search.trim().toLocaleLowerCase('pt-BR');

  const engineCatalogs = documents.filter(isThirdPartyEngineCatalog);
  const matchesSearch = (document: DocumentItem) => {
    if (!normalized) return true;
    const model = formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename);
    const values = [document.filename, document.model, document.manufacturer, document.category, document.pnc, model, ...catalogPncs(document)];
    const applicationMatch = (document.applications || []).some(item => `${item.machineModel} ${item.machinePnc || ''} ${item.label}`.toLocaleLowerCase('pt-BR').includes(normalized));
    return applicationMatch || values.some(value => value?.toLocaleLowerCase('pt-BR').includes(normalized));
  };
  // Quando a busca bate num motor que saiu da lista, o balcão não fica sem resposta: ganha o atalho para o catálogo dele no Atendimento.
  const engineShortcuts = normalized && onSearch ? engineCatalogs.filter(matchesSearch).slice(0, 6) : [];

  const filtered = documents
    .filter(document => {
      if (isThirdPartyEngineCatalog(document)) return false;
      if (category !== 'ALL' && document.category !== category) return false;
      if (!normalized) return true;
      const model = formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename);
      const values = [document.filename, document.model, document.manufacturer, document.category, document.pnc, model, ...catalogPncs(document)];
      const applicationMatch = (document.applications || []).some(item => `${item.machineModel} ${item.machinePnc || ''} ${item.label}`.toLocaleLowerCase('pt-BR').includes(normalized));
      return applicationMatch || values.some(value => value?.toLocaleLowerCase('pt-BR').includes(normalized));
    })
    .sort((a, b) => {
      const nameA = formatEngineOrCatalogModel(a.model, a.manufacturer, a.filename) || a.filename;
      const nameB = formatEngineOrCatalogModel(b.model, b.manufacturer, b.filename) || b.filename;
      return nameA.localeCompare(nameB, 'pt-BR', { numeric: true, sensitivity: 'base' });
    });

  if (managementOpen) {
    return (
      <section className="mx-auto w-full max-w-[1500px] px-5 py-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => setManagementOpen(false)}><ChevronLeft className="size-4" />Voltar para catálogos</Button>
          <span className="text-base text-muted-foreground">Administração da biblioteca</span>
        </div>
        <CatalogsPanel admin={admin} onQuality={onQuality} initialSearch={initialSearch} onSearch={onSearch} />
      </section>
    );
  }

  const access = async (document: DocumentItem) => {
    try {
      const response = await apiJson<{ url: string }>(`/api/documents/${document.id}/access?mode=view`);
      setPdf({ url: response.url, title: formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename) || document.filename });
    } catch (accessError) {
      toast.error(accessError instanceof Error ? accessError.message : 'Não foi possível abrir o catálogo.');
    }
  };

  return (
    <PageFrame
      look="band"
      title="Catálogos"
      meta={`${filtered.length} ${filtered.length === 1 ? 'catálogo' : 'catálogos'}`}
      action={admin ? <Button type="button" variant="bar" size="sm" onClick={() => setManagementOpen(true)}>Gerenciar biblioteca</Button> : undefined}
      band={
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative min-w-0 max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5f667a]" aria-hidden="true" />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              aria-label="Buscar catálogo por modelo, arquivo, PNC ou aplicação"
              autoComplete="off"
              spellCheck={false}
              placeholder="Modelo, arquivo ou PNC…"
              className={cn('h-11 pl-9 text-base', BAND_FIELD)}
            />
          </div>
          <select
            value={category}
            onChange={event => setCategory(event.target.value)}
            aria-label="Filtrar por categoria"
            className={cn('h-11 rounded-md border px-3 text-base outline-none focus-visible:ring-3', BAND_FIELD)}
          >
            <option value="ALL">Todas as categorias</option>
            {categories.map(item => <option key={item} value={item}>{categoryLabel(item)}</option>)}
          </select>
        </div>
      }
    >

      {error && <div role="alert" className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-base font-medium text-destructive">{error instanceof Error ? error.message : 'Não foi possível carregar os catálogos.'}</div>}

      {engineShortcuts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
          <span className="text-base text-muted-foreground">Motor com catálogo no Atendimento:</span>
          {[...new Map(engineShortcuts.map(document => [engineSearchTerm(document), document])).values()].map(document => (
            <Button key={document.id} type="button" variant="outline" onClick={() => onSearch?.(engineSearchTerm(document))}>
              <span translate="no" className="font-code tabular-nums">{engineSearchTerm(document)}</span>
            </Button>
          ))}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Modelo</TableHead>
            <TableHead className="w-56">Categoria</TableHead>
            <TableHead className="w-80"><span className="sr-only">Ações</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            [0, 1, 2, 3].map(item => (
              <TableRow key={item} aria-hidden="true">
                <TableCell><div className="space-y-2"><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-56" /></div></TableCell>
                <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                <TableCell><Skeleton className="ml-auto h-10 w-48" /></TableCell>
              </TableRow>
            ))
          ) : filtered.length ? filtered.map(document => {
            const title = formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename) || document.model || document.filename;
            const pncs = catalogPncs(document);
            const problem = problemLabel(document);
            return (
              <TableRow key={document.id}>
                <TableCell className="max-w-0">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-xl font-semibold" translate="no">{title}</span>
                      {problem && <span className={cn('rounded px-1.5 text-sm font-semibold', problem.tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-destructive/10 text-destructive')}>{problem.text}</span>}
                    </div>
                    <div className="truncate text-sm text-muted-foreground">
                      {[document.filename, pncs.length > 0 ? `PNC ${pncs.slice(0, 2).join(' · ')}${pncs.length > 2 ? ` +${pncs.length - 2}` : ''}` : ''].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{categoryLabel(document.category) || 'Sem categoria'}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 lg:justify-end">
                    {onSearch && document.status === 'COMPLETED' && <Button type="button" variant="ghost" onClick={() => onSearch(title)}>Ver peças</Button>}
                    <Button type="button" variant="outline" disabled={document.status !== 'COMPLETED'} onClick={() => void access(document)}>Abrir vista explodida</Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          }) : (
            <TableEmpty colSpan={3}>
              <p className="text-xl font-semibold text-foreground">Nenhum catálogo encontrado</p>
              <p className="mt-1">Ajuste o modelo, o PNC ou a categoria.</p>
            </TableEmpty>
          )}
        </TableBody>
      </Table>

      <Sheet open={pdf !== null} onOpenChange={open => { if (!open) setPdf(null); }}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 border-border bg-background p-0 sm:max-w-[min(1500px,96vw)]">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-6 py-3">
            <SheetTitle className="truncate text-xl font-semibold text-foreground">{pdf?.title}</SheetTitle>
            <SheetDescription className="sr-only">Vista explodida do catálogo</SheetDescription>
            <Button type="button" variant="outline" onClick={() => setPdf(null)}>Fechar</Button>
          </header>
          {pdf && <iframe title={pdf.title} src={pdf.url} className="min-h-0 w-full flex-1 border-0 bg-white" />}
        </SheetContent>
      </Sheet>
    </PageFrame>
  );
}
