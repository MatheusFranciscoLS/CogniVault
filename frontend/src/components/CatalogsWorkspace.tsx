import { useState } from 'react';
import PageFrame from './PageFrame';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Copy, ExternalLink, Search } from 'lucide-react';
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

const ROW_GRID = 'lg:grid-cols-[minmax(240px,1.6fr)_minmax(150px,0.8fr)_300px]';

/**
 * Catálogo de peças Kawasaki: abrir + copiar o modelo.
 *
 * **Não é integração, e não pode ser.** Medido: a lista de peças da Kawasaki
 * vive no ARI PartStream com uma app key do site deles, e a página do
 * localizador roda reCAPTCHA. O `/manuals` público tem só manual do
 * proprietário, por série, e a própria página manda procurar o revendedor para
 * o manual de serviço. Link profundo também não existe: a URL de um conjunto
 * carrega dois GUIDs, e abrir só com o modelo cai na busca genérica.
 *
 * Então é o mesmo padrão já decidido para o Portal Parceiro: abre a busca
 * oficial e o atendente cola o modelo. O botão de copiar existe porque o
 * modelo é série+spec da plaqueta (`FX921V-ES06`) e o autocompletar da
 * Kawasaki só reconhece com os dois juntos — digitar errado ali devolve nada.
 */
function KawasakiPartsLink({ model, url }: { model: string; url: string }) {
  return (
    <span className="mt-1.5 inline-flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <a href={url} target="_blank" rel="noreferrer noopener" title="Abrir o catálogo oficial de peças da Kawasaki. Cole o modelo no campo Model e CLIQUE na opção que aparecer.">
          Catálogo Kawasaki <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        title="Copiar o modelo para colar na busca da Kawasaki"
        onClick={() => {
          void navigator.clipboard.writeText(model).then(
            () => toast.success(`Modelo ${model} copiado. Cole no campo Model e clique na opção.`),
            () => toast.error('Não foi possível copiar. Anote o modelo: ' + model),
          );
        }}
      >
        <span translate="no" className="font-code tabular-nums">{model}</span>
        <Copy className="size-3.5" aria-hidden="true" />
      </Button>
    </span>
  );
}

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

  const filtered = documents
    .filter(document => {
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
      <section>
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
      title="Catálogos"
      meta={`${filtered.length} ${filtered.length === 1 ? 'catálogo' : 'catálogos'}`}
      action={admin ? <Button type="button" variant="outline" size="sm" onClick={() => setManagementOpen(true)}>Gerenciar biblioteca</Button> : undefined}
    >

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            aria-label="Buscar catálogo por modelo, arquivo, PNC ou aplicação"
            autoComplete="off"
            spellCheck={false}
            placeholder="Modelo, arquivo ou PNC…"
            className="pl-9 text-base"
          />
        </div>
        <select
          value={category}
          onChange={event => setCategory(event.target.value)}
          aria-label="Filtrar por categoria"
          className="h-10 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          <option value="ALL">Todas as categorias</option>
          {categories.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      {error && <div role="alert" className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-base font-medium text-destructive">{error instanceof Error ? error.message : 'Não foi possível carregar os catálogos.'}</div>}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className={cn('hidden h-10 items-center gap-x-4 border-b border-border bg-muted px-4 text-sm font-semibold text-muted-foreground lg:grid', ROW_GRID)}>
          <span>Modelo</span><span>Categoria</span><span />
        </div>

        {isLoading ? (
          <div aria-hidden="true">
            <span role="status" className="sr-only">Carregando catálogos…</span>
            {[0, 1, 2, 3].map(item => (
              <div key={item} className={cn('grid items-center gap-x-4 gap-y-2 border-b border-border px-4 py-4 last:border-0', ROW_GRID)}>
                <div className="space-y-2"><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-56" /></div>
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-10 w-48 lg:ml-auto" />
              </div>
            ))}
          </div>
        ) : filtered.length ? filtered.map(document => {
          const title = formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename) || document.model || document.filename;
          const pncs = catalogPncs(document);
          const problem = problemLabel(document);
          return (
            <article key={document.id} className={cn('grid items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3.5 transition-colors last:border-0 hover:bg-muted', ROW_GRID)}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-xl font-semibold" translate="no">{title}</span>
                  {problem && <span className={cn('rounded px-1.5 text-sm font-semibold', problem.tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-destructive/10 text-destructive')}>{problem.text}</span>}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {[document.filename, pncs.length > 0 ? `PNC ${pncs.slice(0, 2).join(' · ')}${pncs.length > 2 ? ` +${pncs.length - 2}` : ''}` : ''].filter(Boolean).join(' · ')}
                </div>
                {/* Abre a LISTA DE PEÇAS do motor, não a busca de manuais. O link antigo apontava para a
                    página de resultados da Briggs, onde os dois PARTS MANUAL ficam no fim de 16 itens quase
                    idênticos — o atendente abria PDF errado até achar. A rota do servidor resolve pela API da
                    Briggs e manda o inglês quando existe. */}
                {document.briggsEngineModel ? (
                  <span className="mt-1.5 inline-flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`/api/briggs/parts-manuals/open?model=${encodeURIComponent(document.briggsEngineModel)}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        title={`Abrir a lista de peças oficial do motor ${document.briggsEngineModel} — inglês quando a Briggs publica; senão, o idioma disponível`}
                      >
                        Lista de peças Briggs <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    </Button>
                    {document.briggsManualsUrl && (
                      <Button asChild variant="ghost" size="sm">
                        <a href={document.briggsManualsUrl} target="_blank" rel="noreferrer noopener" title="Todos os manuais deste motor no site da Briggs (inclui manual do operador)">Todos os manuais</a>
                      </Button>
                    )}
                  </span>
                ) : document.briggsManualsUrl ? (
                  <Button asChild variant="outline" size="sm" className="mt-1.5">
                    <a href={document.briggsManualsUrl} target="_blank" rel="noreferrer noopener" title="Abrir manuais oficiais no site da Briggs & Stratton">
                      Manuais Briggs <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  </Button>
                ) : document.kawasakiEngineModel && document.kawasakiPartsUrl ? (
                  <KawasakiPartsLink model={document.kawasakiEngineModel} url={document.kawasakiPartsUrl} />
                ) : null}
              </div>
              <div className="text-base text-muted-foreground">{document.category || 'Sem categoria'}</div>
              <div className="flex items-center gap-2 lg:justify-end">
                {onSearch && document.status === 'COMPLETED' && <Button type="button" variant="ghost" onClick={() => onSearch(title)}>Ver peças</Button>}
                <Button type="button" variant="outline" disabled={document.status !== 'COMPLETED'} onClick={() => void access(document)}>Abrir vista explodida</Button>
              </div>
            </article>
          );
        }) : (
          <div className="px-5 py-14 text-center">
            <p className="text-xl font-semibold">Nenhum catálogo encontrado</p>
            <p className="mt-1 text-base text-muted-foreground">Ajuste o modelo, o PNC ou a categoria.</p>
          </div>
        )}
      </div>

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
