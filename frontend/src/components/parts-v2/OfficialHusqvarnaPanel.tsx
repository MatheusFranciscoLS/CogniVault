import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiJson, cleanErpCode } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import SourceBadge from './SourceBadge';
import type {
  HusqvarnaOfficialIplPart,
  HusqvarnaOfficialPartDetails,
  HusqvarnaOfficialProductDetails,
  HusqvarnaOfficialRelatedSparePart,
  HusqvarnaOfficialSearchResult,
  HusqvarnaOfficialSpecification,
  OfficialFallbackResult,
} from './types';

type Tab = 'IPL' | 'SPECS' | 'DOCS' | 'VARIANTS' | 'FEATURES' | 'ACCESSORIES' | 'USES' | 'SPARE_PARTS';
type InspectablePart = HusqvarnaOfficialIplPart | HusqvarnaOfficialRelatedSparePart;
type Props = { result: OfficialFallbackResult };
type MachinePartMatch = { sectionId: string; sectionName: string; key: string; part: HusqvarnaOfficialIplPart };

function money(value: number | null | undefined): string {
  return typeof value === 'number'
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
    : 'Sem preço cadastrado';
}

function labelForType(type: string): string {
  if (type === 'OM') return 'Manual do operador';
  if (type === 'IPL') return 'Catálogo de peças (IPL)';
  return type || 'Documento';
}

function equipmentName(item: { id: string; name: string }): string {
  if (item.id === 'PT1966') return 'Bateria';
  if (item.id === 'PT1968') return 'Carregador de bateria';
  return item.name;
}

function formatDocumentDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', { month: '2-digit', year: 'numeric' }).format(date);
}

function normalizeSearch(value: unknown): string {
  return String(value || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeComparable(value: unknown): string {
  return normalizeSearch(value).replace(/^husqvarna\s+/, '').replace(/[^a-z0-9]/g, '');
}

function sectionShortId(id: string): string {
  return id.replace(/^HVA_PL-/i, '').slice(-8) || id;
}

function partKey(sectionId: string, index: number, part: HusqvarnaOfficialIplPart): string {
  return `${sectionId}|${index}|${part.partNumber || part.position || part.name}`;
}

function spareKey(part: HusqvarnaOfficialRelatedSparePart): string {
  return `spare|${part.partNumber}`;
}

function domId(key: string): string {
  return `husq-part-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function additionalApplications(part: InspectablePart, detail: HusqvarnaOfficialPartDetails | undefined): string[] {
  if (!detail) return [];
  const alreadyVisible = new Set(uniqueStrings(part.commercial?.applications || []).map(normalizeComparable));
  return uniqueStrings(detail.fitsTo || []).filter(value => !alreadyVisible.has(normalizeComparable(value)));
}

function detailHasUsefulExtra(part: InspectablePart, detail: HusqvarnaOfficialPartDetails): boolean {
  if (detail.replacementChain?.length) return true;
  if (additionalApplications(part, detail).length) return true;
  if (detail.specifications?.ean) return true;
  if (detail.officialUrl && !part.url) return true;
  const shownName = part.commercial?.name || part.name;
  if (detail.name && normalizeComparable(detail.name) !== normalizeComparable(shownName)) return true;
  return false;
}

function applicabilityLabel(comment: string): string {
  return /(serial|s\/n|série|serie|a partir|até|\bate\b|before|after|from|variant|variante|modelo|model|pnc)/i.test(comment)
    ? 'Aplicabilidade / serial'
    : 'Observação técnica';
}

function hotspotFromCoordinates(
  raw: string | null,
  referenceWidth: number | null,
  referenceHeight: number | null,
): { left: number; top: number } | null {
  if (!raw) return null;
  const values = (raw.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
  if (values.length < 2) return null;
  let x = values[0];
  let y = values[1];

  if (values.length >= 6 && values.length % 2 === 0) {
    const xs = values.filter((_, index) => index % 2 === 0);
    const ys = values.filter((_, index) => index % 2 === 1);
    x = (Math.min(...xs) + Math.max(...xs)) / 2;
    y = (Math.min(...ys) + Math.max(...ys)) / 2;
  } else if (values.length >= 4) {
    const [left, top, third, fourth] = values;
    if (referenceWidth && referenceHeight && third > 0 && fourth > 0 && left + third <= referenceWidth * 1.05 && top + fourth <= referenceHeight * 1.05) {
      x = left + third / 2;
      y = top + fourth / 2;
    } else if (third > left && fourth > top) {
      x = (left + third) / 2;
      y = (top + fourth) / 2;
    }
  }

  if (referenceWidth && referenceHeight && referenceWidth > 0 && referenceHeight > 0) {
    const left = (x / referenceWidth) * 100;
    const top = (y / referenceHeight) * 100;
    if (left < -2 || left > 102 || top < -2 || top > 102) return null;
    return { left: Math.max(0, Math.min(100, left)), top: Math.max(0, Math.min(100, top)) };
  }
  if (x >= 0 && x <= 1.01 && y >= 0 && y <= 1.01) return { left: x * 100, top: y * 100 };
  if (x >= 0 && x <= 100 && y >= 0 && y <= 100) return { left: x, top: y };
  return null;
}

export default function OfficialHusqvarnaPanel({ result }: Props) {
  const quoteCart = useQuoteCart();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<HusqvarnaOfficialProductDetails | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('IPL');
  const [sectionId, setSectionId] = useState('');
  const [machineSearch, setMachineSearch] = useState('');
  const [selectedParts, setSelectedParts] = useState<Set<string>>(() => new Set());
  const [highlightedPart, setHighlightedPart] = useState<string | null>(null);
  const [expandedPartKeys, setExpandedPartKeys] = useState<Set<string>>(() => new Set());
  const [noExtraDetailKeys, setNoExtraDetailKeys] = useState<Set<string>>(() => new Set());
  const [partDetailsByCode, setPartDetailsByCode] = useState<Map<string, HusqvarnaOfficialPartDetails>>(() => new Map());
  const [partLoadingCodes, setPartLoadingCodes] = useState<Set<string>>(() => new Set());
  const [partErrorsByCode, setPartErrorsByCode] = useState<Map<string, string>>(() => new Map());

  const selectedSection = useMemo(() => {
    if (!details?.iplSections.length) return null;
    return details.iplSections.find(section => section.id === sectionId) || details.iplSections[0];
  }, [details, sectionId]);

  const duplicateSectionNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const section of details?.iplSections || []) counts.set(section.name, (counts.get(section.name) || 0) + 1);
    return counts;
  }, [details]);

  const machineMatches = useMemo<MachinePartMatch[]>(() => {
    const query = normalizeSearch(machineSearch.trim());
    if (!details || query.length < 2) return [];
    const matches: MachinePartMatch[] = [];
    for (const section of details.iplSections) {
      section.parts.forEach((part, index) => {
        const haystack = normalizeSearch([
          section.name, part.position, part.partNumber, part.name, part.description, part.comment,
          part.commercial?.name, part.commercial?.applications?.join(' '),
        ].filter(Boolean).join(' '));
        if (!haystack.includes(query)) return;
        matches.push({ sectionId: section.id, sectionName: section.name, key: partKey(section.id, index, part), part });
      });
    }
    return matches.slice(0, 60);
  }, [details, machineSearch]);

  const selectedSectionHotspots = useMemo(() => {
    if (!selectedSection) return [];
    return selectedSection.parts
      .map((part, index) => ({ index, part, point: hotspotFromCoordinates(part.coordinates, selectedSection.referenceWidth, selectedSection.referenceHeight) }))
      .filter(item => item.point !== null);
  }, [selectedSection]);

  const variantDifferenceKeys = useMemo(() => {
    const variants = details?.variants || [];
    const valuesByKey = new Map<string, Set<string>>();
    for (const variant of variants) {
      for (const spec of variant.specifications || []) {
        const key = `${spec.group}|${spec.name}`;
        const values = valuesByKey.get(key) || new Set<string>();
        values.add(spec.value);
        valuesByKey.set(key, values);
      }
    }
    return new Set([...valuesByKey.entries()].filter(([, values]) => values.size > 1).map(([key]) => key));
  }, [details]);

  const visibleTabs = useMemo(() => {
    const all: Array<{ id: Tab; label: string; count: number }> = [
      { id: 'IPL', label: 'Vistas explodidas', count: details?.iplSections.length || 0 },
      { id: 'SPARE_PARTS', label: 'Peças relacionadas', count: details?.spareParts.length || 0 },
      { id: 'SPECS', label: 'Especificações', count: details?.specifications.length || 0 },
      { id: 'DOCS', label: 'Documentos', count: details?.documents.length || 0 },
      { id: 'VARIANTS', label: 'Variantes', count: details?.variants.length || 0 },
      { id: 'FEATURES', label: 'Características', count: details?.features?.length || 0 },
      { id: 'ACCESSORIES', label: 'Acessórios', count: details?.accessories.length || 0 },
      { id: 'USES', label: 'Também usado em', count: details?.alsoUsedIn.length || 0 },
    ];
    return all.filter(item => item.id === 'IPL' || item.count > 0);
  }, [details]);

  const openDetails = async () => {
    if (expanded && details) {
      setExpanded(false);
      return;
    }
    if (!result.pnc) return;
    setExpanded(true);
    if (details) return;
    setLoading(true);
    setError('');
    try {
      const response = await apiJson<{ product: HusqvarnaOfficialProductDetails }>(`/api/husqvarna/products/${encodeURIComponent(result.pnc)}/details`, { timeoutMs: 20_000 });
      setDetails(response.product);
      setSectionId(response.product.iplSections[0]?.id || '');
      if (!response.product.iplSections.length) {
        const firstUseful: Tab = response.product.specifications.length ? 'SPECS' : response.product.documents.length ? 'DOCS' : response.product.features?.length ? 'FEATURES' : 'VARIANTS';
        setTab(firstUseful);
      }
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : 'Não foi possível carregar os dados oficiais.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPartDetail = async (part: InspectablePart): Promise<HusqvarnaOfficialPartDetails> => {
    if (!part.partNumber) throw new Error('Peça sem código oficial.');
    const code = cleanErpCode(part.partNumber);
    const cached = partDetailsByCode.get(code);
    if (cached) return cached;
    setPartLoadingCodes(current => new Set(current).add(code));
    try {
      const response = await apiJson<{ part: HusqvarnaOfficialPartDetails }>(`/api/husqvarna/parts/${encodeURIComponent(code)}/details`, { timeoutMs: 20_000 });
      setPartDetailsByCode(current => new Map(current).set(code, response.part));
      return response.part;
    } finally {
      setPartLoadingCodes(current => {
        const next = new Set(current);
        next.delete(code);
        return next;
      });
    }
  };

  const toggleInlineDetails = async (part: InspectablePart, cardKey: string) => {
    if (!part.partNumber) return;
    if (expandedPartKeys.has(cardKey)) {
      setExpandedPartKeys(current => { const next = new Set(current); next.delete(cardKey); return next; });
      return;
    }
    setPartErrorsByCode(current => { const next = new Map(current); next.delete(cleanErpCode(part.partNumber!)); return next; });
    try {
      const detail = await fetchPartDetail(part);
      if (!detailHasUsefulExtra(part, detail)) {
        setNoExtraDetailKeys(current => new Set(current).add(cardKey));
        toast.info('A fonte oficial não trouxe informação adicional para esta peça.');
        return;
      }
      setExpandedPartKeys(current => new Set(current).add(cardKey));
    } catch (partError) {
      const message = partError instanceof Error ? partError.message : 'Não foi possível consultar os detalhes da peça.';
      setPartErrorsByCode(current => new Map(current).set(cleanErpCode(part.partNumber!), message));
      setExpandedPartKeys(current => new Set(current).add(cardKey));
    }
  };

  const retryInlineDetails = async (part: InspectablePart, cardKey: string) => {
    if (!part.partNumber) return;
    const code = cleanErpCode(part.partNumber);
    setPartDetailsByCode(current => { const next = new Map(current); next.delete(code); return next; });
    setPartErrorsByCode(current => { const next = new Map(current); next.delete(code); return next; });
    setExpandedPartKeys(current => { const next = new Set(current); next.delete(cardKey); return next; });
    await toggleInlineDetails(part, cardKey);
  };

  const openOfficialPart = async (part: InspectablePart) => {
    const code = part.partNumber ? cleanErpCode(part.partNumber) : '';
    const directUrl = part.url || (code ? partDetailsByCode.get(code)?.officialUrl : null);
    if (directUrl) {
      window.open(directUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const popup = window.open('about:blank', '_blank');
    try {
      const detail = await fetchPartDetail(part);
      if (!detail.officialUrl) throw new Error('A Husqvarna não forneceu um link direto para esta peça.');
      if (popup) popup.location.href = detail.officialUrl;
      else window.location.href = detail.officialUrl;
    } catch (openError) {
      popup?.close();
      toast.error(openError instanceof Error ? openError.message : 'Não foi possível abrir a peça.');
    }
  };

  const openApplication = async (application: string) => {
    const query = application.trim();
    if (!query) return;
    try {
      const response = await apiJson<{ results: unknown }>(`/api/husqvarna/products/search?q=${encodeURIComponent(query)}`, { timeoutMs: 12_000 });
      const raw = Array.isArray(response.results) ? response.results : [];
      const products: Array<Pick<HusqvarnaOfficialSearchResult, 'pnc' | 'title'>> = raw.flatMap(rawItem => {
        const item = rawItem as Record<string, unknown>;
        if (item.kind === 'PRODUCT' && typeof item.pnc === 'string' && typeof item.title === 'string') {
          return [{ pnc: item.pnc, title: item.title }];
        }
        if (typeof item.productName === 'string' && typeof item.pnc === 'string') {
          return [{ pnc: item.pnc, title: item.productName }];
        }
        return [];
      });
      const expected = normalizeComparable(query);
      const exact = products.filter(item => normalizeComparable(item.title) === expected);
      if (exact.length === 1 && exact[0].pnc) {
        window.location.assign(`/husqvarna?pnc=${encodeURIComponent(exact[0].pnc)}`);
        return;
      }
    } catch {
      // A página de busca oficial é o fallback seguro quando não há uma resolução única.
    }
    window.location.assign(`/husqvarna?search=${encodeURIComponent(query)}`);
  };

  const copyPart = async (partNumber: string) => {
    try {
      await navigator.clipboard.writeText(cleanErpCode(partNumber));
      toast.success(`Código ${cleanErpCode(partNumber)} copiado.`);
    } catch {
      toast.info(`Código: ${cleanErpCode(partNumber)}`);
    }
  };

  const addToQuote = (part: HusqvarnaOfficialIplPart, sectionName = selectedSection?.name || null) => {
    if (!part.partNumber || !details) return;
    quoteCart.addItem({
      partNumber: part.partNumber,
      effectiveCode: part.partNumber,
      name: part.commercial?.name || part.name,
      model: details.model,
      pnc: details.pnc,
      section: sectionName,
      position: part.position,
      notes: part.comment,
      unitPrice: part.commercial?.price ?? undefined,
      quantity: part.quantity && part.quantity > 0 ? part.quantity : 1,
    });
  };

  const addSpareToQuote = (part: HusqvarnaOfficialRelatedSparePart) => {
    if (!details) return;
    quoteCart.addItem({
      partNumber: part.partNumber,
      effectiveCode: part.partNumber,
      name: part.commercial?.name || part.name,
      model: details.model,
      pnc: details.pnc,
      section: 'Peças de reposição relacionadas',
      unitPrice: part.commercial?.price ?? undefined,
      quantity: 1,
    });
  };

  const toggleSelected = (key: string) => {
    setSelectedParts(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };

  const toggleCurrentSection = () => {
    if (!selectedSection) return;
    const codedKeys = selectedSection.parts.map((part, index) => ({ part, key: partKey(selectedSection.id, index, part) })).filter(item => Boolean(item.part.partNumber));
    const allSelected = codedKeys.length > 0 && codedKeys.every(item => selectedParts.has(item.key));
    setSelectedParts(current => {
      const next = new Set(current);
      for (const item of codedKeys) {
        if (allSelected) next.delete(item.key);
        else next.add(item.key);
      }
      return next;
    });
  };

  const addSelectedToQuote = () => {
    if (!details || !selectedParts.size) return;
    const items: Parameters<typeof quoteCart.addItems>[0] = [];
    for (const section of details.iplSections) {
      section.parts.forEach((part, index) => {
        const key = partKey(section.id, index, part);
        if (!selectedParts.has(key) || !part.partNumber) return;
        items.push({
          partNumber: part.partNumber,
          effectiveCode: part.partNumber,
          name: part.commercial?.name || part.name,
          model: details.model,
          pnc: details.pnc,
          section: section.name,
          position: part.position,
          notes: part.comment,
          unitPrice: part.commercial?.price ?? undefined,
          quantity: part.quantity && part.quantity > 0 ? part.quantity : 1,
        });
      });
    }
    if (!items.length) return;
    quoteCart.addItems(items);
    setSelectedParts(new Set());
  };

  const focusPart = (targetSectionId: string, key: string) => {
    setTab('IPL');
    setSectionId(targetSectionId);
    setHighlightedPart(key);
    window.setTimeout(() => document.getElementById(domId(key))?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    window.setTimeout(() => setHighlightedPart(current => current === key ? null : current), 2500);
  };

  const renderApplications = (applications: Array<string | null> | undefined, limit = 3) => {
    const values = uniqueStrings(applications || []);
    if (!values.length) return null;
    return <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {values.slice(0, limit).map(item => <button key={item} type="button" onClick={() => void openApplication(item)} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500 transition hover:border-blue-300 hover:text-blue-700" title="Localizar esta aplicação na Husqvarna">{item}</button>)}
      {values.length > limit && <span className="text-[10px] font-bold text-slate-400">+{values.length - limit}</span>}
    </div>;
  };

  const renderInlineDetails = (part: InspectablePart, cardKey: string) => {
    if (!part.partNumber || !expandedPartKeys.has(cardKey)) return null;
    const code = cleanErpCode(part.partNumber);
    const detail = partDetailsByCode.get(code);
    const detailError = partErrorsByCode.get(code);
    const extras = additionalApplications(part, detail);
    const ean = detail?.specifications?.ean;

    return <div id={`${domId(cardKey)}-details`} className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/20">
      {detailError && <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs font-semibold text-rose-700">{detailError}</div><button type="button" onClick={() => void retryInlineDetails(part, cardKey)} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-rose-700">Tentar novamente</button></div>}
      {detail && !detailError && <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="text-[10px] font-black uppercase tracking-wide text-blue-700">Informações adicionais oficiais</div>{normalizeComparable(detail.name) !== normalizeComparable(part.commercial?.name || part.name) && <div className="mt-1 text-xs font-black">{detail.name}</div>}</div>
          {detail.officialUrl && !part.url && <button type="button" onClick={() => void openOfficialPart(part)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-[10px] font-black text-blue-700">Abrir peça ↗</button>}
        </div>
        {detail.replacementChain?.length > 0 && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900"><div className="font-black">Substituição confirmada</div><div className="mt-1 flex flex-wrap items-center gap-1 font-mono font-bold"><span>{cleanErpCode(detail.replacementChain[0].from)}</span>{detail.replacementChain.map(link => <span key={`${link.from}-${link.to}`} className="contents"><span>→</span><span>{cleanErpCode(link.to)}</span></span>)}</div></div>}
        {extras.length > 0 && <div className="mt-3"><div className="text-[9px] font-black uppercase tracking-wide text-blue-700">Aplicações adicionais encontradas</div><div className="mt-2 flex flex-wrap gap-1.5">{extras.slice(0, 40).map(item => <button key={item} type="button" onClick={() => void openApplication(item)} className="rounded-full border border-blue-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:text-blue-700">{item}</button>)}</div></div>}
        {ean && <div className="mt-3 text-[11px]"><span className="font-bold text-slate-500">EAN</span><span className="ml-2 font-mono font-bold">{ean}</span></div>}
      </>}
    </div>;
  };

  return <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
    <div className="flex justify-center"><SourceBadge source="OFFICIAL" /></div>
    <div className="mt-4 text-center">
      <h2 className="text-base font-black text-slate-900 dark:text-white">{result.name}</h2>
      <div className="mt-1 text-xs font-semibold text-slate-500">{result.pnc ? `PNC ${result.pnc}` : ''}{result.categoryName ? ` · ${result.categoryName}` : ''}{result.discontinued ? ' · Descontinuado' : ''}</div>
      {result.message && <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">{result.message}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => void openDetails()} disabled={!result.pnc || loading} className="rounded-xl bg-[#123867] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{loading ? 'Carregando dados oficiais…' : expanded ? 'Ocultar detalhes' : 'Ver vistas e dados oficiais'}</button>
        {result.url && <a href={result.url} target="_blank" rel="noreferrer" className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-black text-indigo-700">Abrir Portal Husqvarna ↗</a>}
      </div>
    </div>

    {expanded && <div className="mt-6 border-t border-slate-100 pt-5 text-left dark:border-slate-800">
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {loading && <div className="py-8 text-center text-sm font-semibold text-slate-500">Consultando dados oficiais da Husqvarna…</div>}
      {details && <>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-950/40">
          <div><div className="text-sm font-black">{details.productName}</div><div className="mt-1 text-xs text-slate-500">{details.articleDescription || details.categoryName || 'Produto confirmado pela Husqvarna'}</div></div>
          <div className="flex flex-wrap gap-2">{details.portalUrl && <a href={details.portalUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-600">Portal B2B ↗</a>}{details.publicSupportUrl && <a href={details.publicSupportUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-600">Suporte público ↗</a>}</div>
        </div>

        {!!details.equipment?.notIncluded.length && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><span className="font-black">Não acompanha: </span>{details.equipment.notIncluded.map(equipmentName).join(' · ')}</div>}

        <div className="relative mb-4">
          <input value={machineSearch} onChange={event => setMachineSearch(event.target.value)} placeholder="Buscar nesta máquina: código, nome, posição ou seção…" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950" />
          {machineSearch.trim().length >= 2 && <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">{machineMatches.length ? machineMatches.map(match => <button key={match.key} type="button" onClick={() => { focusPart(match.sectionId, match.key); setMachineSearch(''); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"><div className="min-w-0"><div className="truncate text-xs font-black">{match.part.commercial?.name || match.part.name}</div><div className="mt-0.5 text-[10px] text-slate-400">{match.sectionName} · posição {match.part.position || '—'}</div></div><div className="shrink-0 font-mono text-xs font-black text-[#123867]">{match.part.partNumber ? cleanErpCode(match.part.partNumber) : 'sem código'}</div></button>) : <div className="px-3 py-4 text-center text-xs text-slate-500">Nada encontrado nas vistas desta máquina.</div>}</div>}
        </div>

        {selectedParts.size > 0 && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3"><div className="text-xs font-bold text-blue-900">{selectedParts.size} posição(ões) selecionada(s)</div><div className="flex gap-2"><button type="button" onClick={() => setSelectedParts(new Set())} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-[10px] font-black text-blue-700">Limpar</button><button type="button" onClick={addSelectedToQuote} className="rounded-lg bg-[#123867] px-3 py-2 text-[10px] font-black text-white">Adicionar selecionadas ao orçamento</button></div></div>}

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">{visibleTabs.map(item => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-black ${tab === item.id ? 'border-[#123867] bg-[#123867] text-white' : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900'}`}>{item.label} · {item.count}</button>)}</div>

        {tab === 'IPL' && <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="max-h-[680px] space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-800">{details.iplSections.length ? details.iplSections.map(section => { const duplicate = (duplicateSectionNames.get(section.name) || 0) > 1; return <button key={section.id} type="button" onClick={() => setSectionId(section.id)} className={`w-full rounded-lg px-3 py-2 text-left text-xs font-bold ${selectedSection?.id === section.id ? 'bg-blue-50 text-[#123867]' : 'text-slate-600 hover:bg-slate-50'}`}><div>{section.name}{duplicate ? <span className="ml-1 font-mono text-[9px] text-slate-400">· {sectionShortId(section.id)}</span> : null}</div><div className="mt-0.5 text-[10px] font-normal text-slate-400">{section.parts.length} posições</div></button>; }) : <div className="p-4 text-xs text-slate-500">Este PNC não retornou vistas estruturadas.</div>}</div>

          {selectedSection && <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-black">{selectedSection.name}</div><div className="text-[10px] text-slate-400">{selectedSection.id} · fonte oficial Husqvarna</div></div><div className="flex items-center gap-2">{selectedSectionHotspots.length > 0 && <span className="text-[10px] font-bold text-emerald-700">{selectedSectionHotspots.length} posição(ões) clicável(is)</span>}<button type="button" onClick={toggleCurrentSection} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black text-slate-600">Selecionar seção</button></div></div>

            {selectedSection.imageUrl && <div className="mb-4 overflow-auto rounded-xl border border-slate-200 bg-white p-3"><div className="relative mx-auto w-fit max-w-full"><img src={selectedSection.imageUrl} alt={`Vista explodida ${selectedSection.name}`} className="block max-h-[620px] max-w-full object-contain" loading="lazy" />{selectedSectionHotspots.map(({ index, part, point }) => { if (!point) return null; const key = partKey(selectedSection.id, index, part); const applications = uniqueStrings(part.commercial?.applications || []); return <div key={`hotspot-${key}`} style={{ left: `${point.left}%`, top: `${point.top}%` }} className="group absolute -translate-x-1/2 -translate-y-1/2"><button type="button" onClick={() => focusPart(selectedSection.id, key)} className="grid h-6 min-w-6 place-items-center rounded-full border-2 border-white bg-[#123867] px-1 text-[9px] font-black text-white shadow-md transition hover:scale-125 focus:outline-none focus:ring-2 focus:ring-blue-400">{part.position || '•'}</button><div className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 hidden w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl group-hover:block group-focus-within:block"><div className="text-[10px] font-black text-slate-800">{part.commercial?.name || part.name}</div>{part.partNumber && <div className="mt-1 font-mono text-[10px] font-bold text-[#123867]">{cleanErpCode(part.partNumber)}</div>}<div className="mt-1 text-[10px] font-black text-emerald-700">{money(part.commercial?.price)}</div>{applications.length > 0 && <div className="mt-1 text-[9px] text-slate-500">{applications.slice(0, 3).join(' · ')}</div>}{part.comment && <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-[9px] font-semibold text-amber-800">{part.comment}</div>}</div></div>; })}</div></div>}

            <div className="space-y-2">{selectedSection.parts.map((part, index) => {
              const key = partKey(selectedSection.id, index, part);
              const selected = selectedParts.has(key);
              const highlighted = highlightedPart === key;
              const code = part.partNumber ? cleanErpCode(part.partNumber) : '';
              const inlineOpen = expandedPartKeys.has(key);
              const noExtra = noExtraDetailKeys.has(key);
              const loadingPart = code ? partLoadingCodes.has(code) : false;
              return <div id={domId(key)} key={key} className={`rounded-xl border p-3 transition ${highlighted ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : selected ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 flex-1 gap-3">{part.partNumber && <input aria-label={`Selecionar posição ${part.position || index + 1}`} type="checkbox" checked={selected} onChange={() => toggleSelected(key)} className="mt-1 h-4 w-4 rounded border-slate-300" />}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="grid min-h-7 min-w-7 place-items-center rounded-lg bg-slate-100 px-2 text-xs font-black text-[#123867]">{part.position || '—'}</span><span className="text-sm font-black">{part.commercial?.name || part.name}</span>{part.quantity ? <span className="text-[10px] font-bold text-slate-400">Qtd. {part.quantity}</span> : null}</div>{part.partNumber && <button type="button" onClick={() => void copyPart(part.partNumber!)} className="mt-2 font-mono text-sm font-black text-[#123867] hover:underline">{cleanErpCode(part.partNumber)}</button>}{part.description && part.description !== part.name && <div className="mt-1 text-xs text-slate-500">{part.description}</div>}{part.commercial && <div className="mt-2 text-xs"><span className="font-black text-emerald-700">{money(part.commercial.price)}</span></div>}{renderApplications(part.commercial?.applications)}{part.comment && <div className={`mt-2 rounded-lg px-3 py-2 text-[10px] font-semibold ${applicabilityLabel(part.comment) === 'Aplicabilidade / serial' ? 'border border-amber-200 bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'}`}><span className="font-black">{applicabilityLabel(part.comment)}:</span> {part.comment}</div>}</div></div><div className="flex flex-wrap gap-2">{part.partNumber && !noExtra && <button type="button" aria-expanded={inlineOpen} onClick={() => void toggleInlineDetails(part, key)} className={`rounded-lg border px-3 py-2 text-[10px] font-black ${inlineOpen ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>{inlineOpen ? 'Ocultar detalhes' : loadingPart ? 'Consultando…' : 'Mais detalhes'}</button>}{part.partNumber && <button type="button" onClick={() => void openOfficialPart(part)} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black text-slate-600">Abrir peça ↗</button>}{part.partNumber && <button type="button" onClick={() => addToQuote(part)} className="rounded-lg bg-[#123867] px-3 py-2 text-[10px] font-black text-white">+ Orçamento</button>}</div></div>
                {renderInlineDetails(part, key)}
              </div>;
            })}</div>
          </div>}
        </div>}

        {tab === 'SPARE_PARTS' && <div><div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">Peças relacionadas devolvidas pela Husqvarna para este artigo. A posição técnica continua sendo a da vista explodida.</div><div className="grid gap-3 md:grid-cols-2">{details.spareParts.map(part => { const key = spareKey(part); const code = cleanErpCode(part.partNumber); const inlineOpen = expandedPartKeys.has(key); const noExtra = noExtraDetailKeys.has(key); return <div key={part.partNumber} className="rounded-xl border border-slate-200 p-3"><div className="flex gap-3">{part.imageUrl && <img src={part.imageUrl} alt={part.name} className="h-16 w-16 rounded-lg object-contain" loading="lazy" />}<div className="min-w-0 flex-1"><div className="text-xs font-black">{part.commercial?.name || part.name}</div><button type="button" onClick={() => void copyPart(part.partNumber)} className="mt-1 font-mono text-xs font-black text-[#123867] hover:underline">{cleanErpCode(part.partNumber)}</button>{part.description && <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">{part.description}</div>}<div className="mt-2 text-xs font-black text-emerald-700">{money(part.commercial?.price)}</div>{renderApplications(part.commercial?.applications)}</div><div className="flex shrink-0 flex-col gap-2">{!noExtra && <button type="button" onClick={() => void toggleInlineDetails(part, key)} className={`rounded-lg border px-2.5 py-2 text-[10px] font-black ${inlineOpen ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200'}`}>{inlineOpen ? 'Ocultar detalhes' : partLoadingCodes.has(code) ? 'Consultando…' : 'Mais detalhes'}</button>}<button type="button" onClick={() => void openOfficialPart(part)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-black text-slate-600">Abrir peça ↗</button><button type="button" onClick={() => addSpareToQuote(part)} className="rounded-lg bg-[#123867] px-2.5 py-2 text-[10px] font-black text-white">+ Orçamento</button></div></div>{renderInlineDetails(part, key)}</div>; })}</div></div>}

        {tab === 'SPECS' && <div>{details.specifications.length ? <div className="grid gap-2 md:grid-cols-2">{details.specifications.map((spec, index) => <div key={`${spec.group}-${spec.name}-${index}`} className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{spec.group}</div><div className="mt-1 text-xs font-bold text-slate-600">{spec.name}</div><div className="mt-1 text-sm font-black">{spec.value}</div></div>)}</div> : <div className="text-sm text-slate-500">A Husqvarna não retornou especificações estruturadas para esta variante.</div>}</div>}

        {tab === 'DOCS' && <div className="space-y-2">{details.documents.map((document, index) => <a key={`${document.url}-${index}`} href={document.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50"><div><div className="flex flex-wrap items-center gap-2"><div className="text-xs font-black">{document.title}</div>{document.isLatest && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700">MAIS RECENTE</span>}</div><div className="mt-1 text-[10px] text-slate-400">{labelForType(document.type)} · {document.languages.join(', ') || 'idioma não informado'} · {formatDocumentDate(document.lastUpdated) || 'data não informada'} · {document.fileFormat || 'arquivo'}</div></div><span className="text-xs font-black text-blue-700">Abrir ↗</span></a>)}</div>}

        {tab === 'VARIANTS' && <div className="grid gap-3 md:grid-cols-2">{details.variants.map(variant => { const differences = (variant.specifications || []).filter((spec: HusqvarnaOfficialSpecification) => variantDifferenceKeys.has(`${spec.group}|${spec.name}`)).slice(0, 8); return <a href={`/husqvarna?pnc=${encodeURIComponent(variant.pnc)}`} key={variant.pnc} className={`block rounded-xl border p-3 transition hover:border-blue-400 hover:bg-blue-50/40 ${variant.pnc === details.pnc ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200'}`}><div className="font-mono text-sm font-black text-[#123867]">{variant.pnc}</div><div className="mt-1 text-xs text-slate-500">{variant.description || 'Descrição não informada'}</div>{differences.length > 0 && <div className="mt-3 space-y-1">{differences.map(spec => <div key={`${spec.group}-${spec.name}`} className="flex justify-between gap-3 text-[10px]"><span className="text-slate-400">{spec.name}</span><span className="text-right font-black text-slate-700">{spec.value}</span></div>)}</div>}{variant.pnc === details.pnc ? <div className="mt-2 text-[10px] font-black text-blue-700">VARIANTE CONSULTADA</div> : <div className="mt-2 text-[10px] font-black text-blue-600">Abrir esta variante →</div>}</a>; })}</div>}

        {tab === 'FEATURES' && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(details.features || []).map(feature => <div key={`${feature.source}-${feature.id}`} className="overflow-hidden rounded-xl border border-slate-200">{feature.imageUrl && <img src={feature.imageUrl} alt={feature.name} className="h-36 w-full object-contain bg-white" loading="lazy" />}<div className="p-3"><div className="text-xs font-black">{feature.name}</div>{feature.description && <div className="mt-1 text-[11px] leading-5 text-slate-500">{feature.description}</div>}{feature.videoUrl && <a href={feature.videoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] font-black text-blue-700">Ver vídeo oficial ↗</a>}</div></div>)}</div>}

        {tab === 'ACCESSORIES' && <div className="grid gap-3 md:grid-cols-2">{details.accessories.map(accessory => <div key={accessory.id} className="flex gap-3 rounded-xl border border-slate-200 p-3">{accessory.imageUrl && <img src={accessory.imageUrl} alt={accessory.name} className="h-16 w-16 rounded-lg object-contain" loading="lazy" />}<div className="min-w-0 flex-1"><div className="text-xs font-black">{accessory.name}</div><div className="mt-1 text-[10px] text-slate-400">{accessory.category || 'Acessório'}{accessory.discontinued ? ' · descontinuado' : ''}</div>{accessory.description && <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">{accessory.description}</div>}{accessory.url && <a href={accessory.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] font-black text-blue-700">Abrir na Husqvarna ↗</a>}</div></div>)}</div>}

        {tab === 'USES' && <div><div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Produtos que a Husqvarna associa ao uso deste artigo. A relação ajuda na consulta, mas não é tratada como prova automática de intercambialidade.</div><div className="grid gap-3 md:grid-cols-2">{details.alsoUsedIn.map(item => <div key={`${item.kind}-${item.id}`} className="flex gap-3 rounded-xl border border-slate-200 p-3">{item.imageUrl && <img src={item.imageUrl} alt={item.name} className="h-16 w-16 rounded-lg object-contain" loading="lazy" />}<div className="min-w-0 flex-1"><div className="text-xs font-black">{item.name}</div><div className="mt-1 text-[10px] text-slate-400">{item.category || item.kind}{item.discontinued ? ' · descontinuado' : ''}</div>{item.pnc && <div className="mt-1 font-mono text-[11px] font-bold text-[#123867]">PNC {item.pnc}</div>}<div className="mt-2 flex gap-2">{item.pnc && <a href={`/husqvarna?pnc=${encodeURIComponent(item.pnc)}`} className="text-[10px] font-black text-blue-700">Abrir no CogniVault →</a>}{item.url && <a href={item.url} target="_blank" rel="noreferrer" className="text-[10px] font-black text-slate-500">Portal ↗</a>}</div></div></div>)}</div></div>}
      </>}
    </div>}
  </section>;
}
