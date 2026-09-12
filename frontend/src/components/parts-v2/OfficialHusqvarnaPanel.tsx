import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiJson, cleanErpCode } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import SourceBadge from './SourceBadge';
import type {
  HusqvarnaOfficialIplPart,
  HusqvarnaOfficialPartDetails,
  HusqvarnaOfficialProductDetails,
  OfficialFallbackResult,
} from './types';

type Tab = 'IPL' | 'SPECS' | 'DOCS' | 'VARIANTS' | 'ACCESSORIES';

type Props = {
  result: OfficialFallbackResult;
};

function money(value: number | null | undefined): string {
  return typeof value === 'number'
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
    : 'Sem preço cadastrado';
}

function labelForType(type: string): string {
  if (type === 'OM') return 'Manual do operador';
  if (type === 'IPL') return 'Documento IPL';
  return type || 'Documento';
}

export default function OfficialHusqvarnaPanel({ result }: Props) {
  const quoteCart = useQuoteCart();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<HusqvarnaOfficialProductDetails | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('IPL');
  const [sectionId, setSectionId] = useState<string>('');
  const [partDetails, setPartDetails] = useState<HusqvarnaOfficialPartDetails | null>(null);
  const [partLoading, setPartLoading] = useState<string | null>(null);

  const selectedSection = useMemo(() => {
    if (!details?.iplSections.length) return null;
    return details.iplSections.find(section => section.id === sectionId) || details.iplSections[0];
  }, [details, sectionId]);

  const openDetails = async () => {
    if (expanded && details) {
      setExpanded(false);
      return;
    }
    const pnc = result.pnc;
    if (!pnc) return;
    setExpanded(true);
    if (details) return;
    setLoading(true);
    setError('');
    try {
      const response = await apiJson<{ product: HusqvarnaOfficialProductDetails }>(`/api/husqvarna/products/${encodeURIComponent(pnc)}/details`, { timeoutMs: 20_000 });
      setDetails(response.product);
      setSectionId(response.product.iplSections[0]?.id || '');
      if (!response.product.iplSections.length) setTab('SPECS');
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : 'Não foi possível carregar os dados oficiais.');
    } finally {
      setLoading(false);
    }
  };

  const inspectPart = async (part: HusqvarnaOfficialIplPart) => {
    if (!part.partNumber) return;
    setPartLoading(part.partNumber);
    setPartDetails(null);
    try {
      const response = await apiJson<{ part: HusqvarnaOfficialPartDetails }>(`/api/husqvarna/parts/${encodeURIComponent(part.partNumber)}/details`, { timeoutMs: 12_000 });
      setPartDetails(response.part);
    } catch (partError) {
      toast.error(partError instanceof Error ? partError.message : 'Não foi possível consultar aplicações da peça.');
    } finally {
      setPartLoading(null);
    }
  };

  const copyPart = async (partNumber: string) => {
    try {
      await navigator.clipboard.writeText(cleanErpCode(partNumber));
      toast.success(`Código ${cleanErpCode(partNumber)} copiado.`);
    } catch {
      toast.info(`Código: ${cleanErpCode(partNumber)}`);
    }
  };

  const addToQuote = (part: HusqvarnaOfficialIplPart) => {
    if (!part.partNumber || !details) return;
    const effectiveCode = part.replacementPartNumbers[0] || part.partNumber;
    quoteCart.addItem({
      partNumber: part.partNumber,
      effectiveCode,
      originalCode: part.replacementPartNumbers.length ? part.partNumber : undefined,
      isSuperseded: part.replacementPartNumbers.length > 0,
      name: part.commercial?.name || part.name,
      model: details.model,
      pnc: details.pnc,
      section: selectedSection?.name || null,
      position: part.position,
      notes: part.comment,
      unitPrice: part.commercial?.price ?? undefined,
      quantity: part.quantity && part.quantity > 0 ? part.quantity : 1,
    });
  };

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'IPL', label: 'Vistas explodidas', count: details?.iplSections.length },
    { id: 'SPECS', label: 'Especificações', count: details?.specifications.length },
    { id: 'DOCS', label: 'Documentos', count: details?.documents.length },
    { id: 'VARIANTS', label: 'Variantes', count: details?.variants.length },
    { id: 'ACCESSORIES', label: 'Acessórios', count: details?.accessories.length },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex justify-center"><SourceBadge source="OFFICIAL" /></div>
      <div className="mt-4 text-center">
        <h2 className="text-base font-black text-slate-900 dark:text-white">{result.name}</h2>
        <div className="mt-1 text-xs font-semibold text-slate-500">
          {result.pnc ? `PNC ${result.pnc}` : ''}{result.categoryName ? ` · ${result.categoryName}` : ''}{result.discontinued ? ' · Descontinuado' : ''}
        </div>
        {result.message && <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">{result.message}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => void openDetails()} disabled={!result.pnc || loading} className="rounded-xl bg-[#123867] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
            {loading ? 'Carregando dados oficiais…' : expanded ? 'Ocultar detalhes' : 'Ver vistas e dados oficiais'}
          </button>
          {result.url && <a href={result.url} target="_blank" rel="noreferrer" className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-black text-indigo-700">Abrir Portal Husqvarna ↗</a>}
        </div>
      </div>

      {expanded && <div className="mt-6 border-t border-slate-100 pt-5 text-left dark:border-slate-800">
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {loading && <div className="py-8 text-center text-sm font-semibold text-slate-500">Consultando GraphQL oficial da Husqvarna…</div>}
        {details && <>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-950/40">
            <div>
              <div className="text-sm font-black text-slate-900 dark:text-white">{details.productName}</div>
              <div className="mt-1 text-xs text-slate-500">{details.articleDescription || details.categoryName || 'Produto confirmado pela Husqvarna'}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {details.portalUrl && <a href={details.portalUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-600">Portal B2B ↗</a>}
              {details.publicSupportUrl && <a href={details.publicSupportUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-600">Suporte público ↗</a>}
            </div>
          </div>

          <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
            {tabs.map(item => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-black ${tab === item.id ? 'border-[#123867] bg-[#123867] text-white' : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900'}`}>{item.label}{typeof item.count === 'number' ? ` · ${item.count}` : ''}</button>)}
          </div>

          {tab === 'IPL' && <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="max-h-[600px] space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-800">
              {details.iplSections.length ? details.iplSections.map(section => <button key={section.id} type="button" onClick={() => { setSectionId(section.id); setPartDetails(null); }} className={`w-full rounded-lg px-3 py-2 text-left text-xs font-bold ${selectedSection?.id === section.id ? 'bg-blue-50 text-[#123867] dark:bg-blue-950/30' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{section.name}<div className="mt-0.5 text-[10px] font-normal text-slate-400">{section.parts.length} posições</div></button>) : <div className="p-4 text-xs text-slate-500">Este PNC não retornou vistas estruturadas.</div>}
            </div>
            {selectedSection && <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-sm font-black">{selectedSection.name}</div><div className="text-[10px] text-slate-400">{selectedSection.id} · fonte oficial Husqvarna</div></div></div>
              {selectedSection.imageUrl && <div className="mb-4 overflow-auto rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800"><img src={selectedSection.imageUrl} alt={`Vista explodida ${selectedSection.name}`} className="mx-auto max-h-[520px] max-w-full object-contain" loading="lazy" /></div>}
              <div className="space-y-2">
                {selectedSection.parts.map((part, index) => <div key={`${part.position || index}-${part.partNumber || part.name}`} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="grid min-h-7 min-w-7 place-items-center rounded-lg bg-slate-100 px-2 text-xs font-black text-[#123867]">{part.position || '—'}</span><span className="text-sm font-black text-slate-800 dark:text-slate-100">{part.commercial?.name || part.name}</span>{part.quantity ? <span className="text-[10px] font-bold text-slate-400">Qtd. {part.quantity}</span> : null}</div>
                      {part.partNumber && <button type="button" onClick={() => void copyPart(part.partNumber!)} className="mt-2 font-mono text-sm font-black text-[#123867] hover:underline">{cleanErpCode(part.partNumber)}</button>}
                      {part.description && part.description !== part.name && <div className="mt-1 text-xs text-slate-500">{part.description}</div>}
                      {part.commercial && <div className="mt-2 text-xs"><span className="font-black text-emerald-700">{money(part.commercial.price)}</span>{part.commercial.applications?.filter(Boolean).length ? <span className="ml-2 text-slate-400">· {part.commercial.applications.filter(Boolean).slice(0, 2).join(' / ')}</span> : null}</div>}
                      {part.replacementPartNumbers.length > 0 && <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] font-bold text-amber-800">Substituição oficial indicada: {part.replacementPartNumbers.map(code => cleanErpCode(code)).join(', ')}</div>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {part.partNumber && <button type="button" onClick={() => void inspectPart(part)} disabled={partLoading === part.partNumber} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black text-slate-600 disabled:opacity-50">{partLoading === part.partNumber ? 'Consultando…' : 'Aplicações'}</button>}
                      {part.partNumber && <button type="button" onClick={() => addToQuote(part)} className="rounded-lg bg-[#123867] px-3 py-2 text-[10px] font-black text-white">+ Orçamento</button>}
                    </div>
                  </div>
                </div>)}
              </div>
              {partDetails && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wide text-blue-700">Peça oficial</div><div className="mt-1 text-sm font-black">{partDetails.name}</div><div className="font-mono text-xs text-slate-500">{cleanErpCode(partDetails.partNumber)}</div></div>{partDetails.officialUrl && <a href={partDetails.officialUrl} target="_blank" rel="noreferrer" className="text-xs font-black text-blue-700">Abrir peça ↗</a>}</div>
                {partDetails.replacedBy && <div className="mt-3 text-xs font-bold text-amber-800">Código substituto: {cleanErpCode(partDetails.replacedBy)}</div>}
                {partDetails.fitsTo.length > 0 && <div className="mt-3"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Aplicações confirmadas/encontradas</div><div className="mt-2 flex flex-wrap gap-1.5">{partDetails.fitsTo.slice(0, 30).map(item => <span key={item} className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">{item}</span>)}</div></div>}
              </div>}
            </div>}
          </div>}

          {tab === 'SPECS' && <div>{details.specifications.length ? <div className="grid gap-2 md:grid-cols-2">{details.specifications.map((spec, index) => <div key={`${spec.group}-${spec.name}-${index}`} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{spec.group}</div><div className="mt-1 text-xs font-bold text-slate-600 dark:text-slate-300">{spec.name}</div><div className="mt-1 text-sm font-black">{spec.value}</div></div>)}</div> : <div className="text-sm text-slate-500">A Husqvarna não retornou especificações estruturadas para esta variante.</div>}</div>}

          {tab === 'DOCS' && <div className="space-y-2">{details.documents.length ? details.documents.map((document, index) => <a key={`${document.url}-${index}`} href={document.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"><div><div className="text-xs font-black">{document.title}</div><div className="mt-1 text-[10px] text-slate-400">{labelForType(document.type)} · {document.languages.join(', ') || 'idioma não informado'} · {document.fileFormat || 'arquivo'}</div></div><span className="text-xs font-black text-blue-700">Abrir ↗</span></a>) : <div className="text-sm text-slate-500">Nenhum documento oficial retornado.</div>}</div>}

          {tab === 'VARIANTS' && <div className="grid gap-2 md:grid-cols-2">{details.variants.map(variant => <div key={variant.pnc} className={`rounded-xl border p-3 ${variant.pnc === details.pnc ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 dark:border-slate-800'}`}><div className="font-mono text-sm font-black text-[#123867]">{variant.pnc}</div><div className="mt-1 text-xs text-slate-500">{variant.description || 'Descrição não informada'}</div>{variant.pnc === details.pnc && <div className="mt-1 text-[10px] font-black text-blue-700">VARIANTE CONSULTADA</div>}</div>)}</div>}

          {tab === 'ACCESSORIES' && <div className="grid gap-3 md:grid-cols-2">{details.accessories.length ? details.accessories.map(accessory => <div key={accessory.id} className="flex gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">{accessory.imageUrl && <img src={accessory.imageUrl} alt={accessory.name} className="h-16 w-16 rounded-lg object-contain" loading="lazy" />}<div className="min-w-0 flex-1"><div className="text-xs font-black">{accessory.name}</div><div className="mt-1 text-[10px] text-slate-400">{accessory.category || 'Acessório'}{accessory.discontinued ? ' · descontinuado' : ''}</div>{accessory.description && <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">{accessory.description}</div>}{accessory.url && <a href={accessory.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] font-black text-blue-700">Abrir na Husqvarna ↗</a>}</div></div>) : <div className="text-sm text-slate-500">Nenhum acessório estruturado retornado.</div>}</div>}
        </>}
      </div>}
    </section>
  );
}
