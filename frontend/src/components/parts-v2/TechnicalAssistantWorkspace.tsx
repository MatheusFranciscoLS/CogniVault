import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { api, apiJson, cleanErpCode } from '../../lib';
import { playCopySound } from '../../lib/sound';
import { useCounterSession } from '../../context/CounterSessionContext';
import type { OfficialVerification, PartDetail, SearchHistoryItem } from '../../types';
import { recentSearchesFrom, type RecentSearch } from '../../lib/recent-searches';
import PartVerificationDialog, { isSupersededForCode, looksLikePartNumber, normalizePartCode } from '../PartVerificationDialog';
import { Icon } from '../icons/Icon';
import CounterSessionBar from '../CounterSessionBar';
import CounterQuoteRail from '../CounterQuoteRail';
import CommercialPartRow from './CommercialPartRow';
import PartDetailDrawer from './PartDetailDrawer';
import PartResultRow from './PartResultRow';
import type { CommercialPart, HusqvarnaLivePart, OfficialFallbackResult, PdfPreview, PriceSection, SearchDocument, SearchResultPart, SearchStreamMessage } from './types';
import MachineSidePanel from '../machines/MachineSidePanel';
import { PanelErrorBoundary } from '../PanelErrorBoundary';
import { useOfficialMachineSearch } from '../machines/official-machine-search';
import { useMachineList } from '../../lib/use-machine-list';
import { modelMatchTier, rankByModel, machineChipLabel, searchModelTerm } from '../../lib/model-search-rank';
import { portalPnc } from '../../lib/machine-list';
import { useRecentMachines } from '../machines/recent-machines';
import KawasakiEnginePanel from '../machines/KawasakiEnginePanel';
import OilQuickAdd from './OilQuickAdd';
import CodeReplacementCheck from './CodeReplacementCheck';
import { focusFirstResult } from '../../lib/results-keyboard';
import BriggsEnginePanel from '../machines/BriggsEnginePanel';
import OfficialPartOrigin from '../machines/OfficialPartOrigin';
import PartGuesses from './PartGuesses';
import { ResultsGroup, ResultsSkeleton, ResultsTable } from './ResultsTable';
import { groupPartsByCode, nameContainsPhrase } from './group-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Como a Husqvarna classifica o que a busca acha. Peça não está aqui: ela vem
 * pelos caminhos de peça, com preço e estoque, e repetir como link seria pior.
 */
const OFFICIAL_KIND_LABELS: Record<string, string> = {
  ACCESSORY: 'Acessório',
  DOCUMENT: 'Documento',
  CATEGORY: 'Categoria',
  SPARE_PART: 'Peça',
};

type Props = {
  initialQuery: string;
  onQueryChange: (query: string) => void;
  storageScope?: string;
  /**
   * PNC vindo da URL (`?pnc=`), inclusive dos links antigos que apontavam para
   * a aba Máquinas. Abre o painel lateral direto, sem passar pela busca.
   */
  initialMachinePnc?: string;
};

// Mesmo limite de backend/src/controllers/commercial-search.controller.ts
// (loadCommercialSearch corta em .slice(0, 50)). Não há pacote compartilhado
// entre frontend/backend neste monorepo; só espelha o número para decidir
// quando mostrar o aviso de "pode haver mais resultados".
const COMMERCIAL_RESULTS_CAP = 50;

const examples = [
  { label: 'Código exato', value: '587106701' },
  { label: 'Peça + modelo', value: 'carburador 143RII' },
];

/** Menor vem primeiro: português antes de outros idiomas. Manual do operador nem entra (dono, 2026-10-07: só vista explodida). */
function extraRank(item: { title: string; languages: string[] }) {
  return item.languages.some(language => /^pt/i.test(language)) ? 0 : 1;
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

async function consumeSearchStream(response: Response, signal: AbortSignal | undefined, onMessage: (message: SearchStreamMessage) => void) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Seu navegador não conseguiu abrir a busca em tempo real.');
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (signal?.aborted) {
      await reader.cancel();
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      const dataLine = event.split('\n').find(line => line.startsWith('data: '));
      if (!dataLine) continue;
      try {
        onMessage(JSON.parse(dataLine.slice(6)) as SearchStreamMessage);
      } catch (error) {
        console.error('Não foi possível interpretar uma atualização da busca:', error);
      }
    }
  }
}

function RecentSearchesDropdown({ recent, activeIndex, onPick }: { recent: RecentSearch[]; activeIndex: number; onPick: (value: string) => void }) {
  return (
    <div role="listbox" aria-label="Últimas buscas" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
      <div className="px-4 pt-2 text-sm text-muted-foreground">Últimas buscas</div>
      {recent.map((item, index) => (
        <button
          key={item.query}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          onMouseDown={event => { event.preventDefault(); onPick(item.replay); }}
          className={cn('flex min-h-11 w-full items-center justify-between gap-4 px-4 py-2 text-left transition-colors', index === activeIndex ? 'bg-accent' : 'hover:bg-muted')}
        >
          <span className="truncate text-base font-semibold">{item.query}</span>
          {item.label && item.label !== item.query && <span className="max-w-[45%] shrink-0 truncate text-sm text-muted-foreground">{item.label}</span>}
        </button>
      ))}
    </div>
  );
}

function Starter({
  onExample,
  recent,
  onReplay,
  machines,
  onOpenMachine,
}: {
  onExample: (value: string) => void;
  recent: RecentSearch[];
  onReplay: (value: string) => void;
  /** Máquinas que este atendente abriu por último: um clique em vez de redigitar o PNC da etiqueta. */
  machines: Array<{ pnc: string; name: string; meta?: string | null }>;
  onOpenMachine: (machine: { pnc: string; name: string }) => void;
}) {
  // Estado vazio útil: voltar a uma busca recente ou ver como se pesquisa. Sem texto sobre o sistema.
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {recent.length > 0 && (
        <section aria-label="Últimas buscas" className="rounded-xl border border-border bg-card">
          <h2 className="px-4 pb-1 pt-3 text-base font-semibold">Últimas buscas</h2>
          <ul className="pb-2">
            {recent.slice(0, 6).map(item => (
              <li key={item.query}>
                <button type="button" onClick={() => onReplay(item.replay)} title={item.label || undefined} className="flex min-h-10 w-full items-center justify-between gap-4 px-4 py-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-inset">
                  <span className="truncate text-base font-medium">{item.query}</span>
                  {item.label && item.label !== item.query && <span className="max-w-[45%] shrink-0 truncate text-sm text-muted-foreground">{item.label}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {machines.length > 0 && (
        <section aria-label="Máquinas recentes" className="rounded-xl border border-border bg-card">
          <h2 className="px-4 pb-1 pt-3 text-base font-semibold">Máquinas recentes</h2>
          <ul className="pb-2">
            {machines.slice(0, 5).map(item => (
              <li key={item.pnc}>
                <button type="button" onClick={() => onOpenMachine(item)} className="flex min-h-10 w-full items-center justify-between gap-4 px-4 py-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-inset">
                  <span className="flex min-w-0 items-center gap-2"><Icon name="machine" className="size-4 shrink-0 text-muted-foreground" /><span className="truncate text-base font-medium">{item.name}</span></span>
                  <span className="shrink-0 font-code text-sm text-muted-foreground tabular-nums">PNC {item.pnc}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Experimente" className="rounded-xl border border-border bg-card">
        <h2 className="px-4 pb-1 pt-3 text-base font-semibold">Experimente</h2>
        <ul className="pb-2">
          {examples.map(example => (
            <li key={example.label}>
              <button type="button" onClick={() => onExample(example.value)} className="flex min-h-10 w-full items-center justify-between gap-4 px-4 py-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-inset">
                <span className="font-code text-base font-medium tabular-nums">{example.value}</span>
                <span className="text-sm text-muted-foreground">{example.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SuggestionsDropdown({ suggestions, activeIndex, onPick }: { suggestions: SearchResultPart[]; activeIndex: number; onPick: (part: SearchResultPart) => void }) {
  return (
    <div role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
      {suggestions.map((part, index) => (
        <button
          key={part.id}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          onMouseDown={event => { event.preventDefault(); onPick(part); }}
          className={cn('flex min-h-12 w-full items-center justify-between gap-4 px-4 py-2 text-left transition-colors', index === activeIndex ? 'bg-accent' : 'hover:bg-muted')}
        >
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold">{part.name}</span>
            <span className="block truncate text-sm text-muted-foreground">{part.model}{part.pnc ? ` · PNC ${part.pnc}` : ''}</span>
          </span>
          <span className="shrink-0 font-code text-lg font-semibold tabular-nums">{part.partNumber}</span>
        </button>
      ))}
    </div>
  );
}

export default function TechnicalAssistantWorkspace({ initialQuery, onQueryChange, storageScope, initialMachinePnc }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { session, hasContext, updateSession } = useCounterSession();
  const contextRevisionRef = useRef(`${session.machineModel}\u0000${session.pnc}\u0000${session.serial}`);

  const [query, setQuery] = useState(initialQuery);
  const [lastQuery, setLastQuery] = useState(initialQuery.trim());
  const [parts, setParts] = useState<SearchResultPart[]>([]);
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  // Máquinas da MESMA busca.
  //
  // O stream só ANUNCIA o termo (custo zero); a busca sai daqui, pela mesma
  // função e mesma chave de cache que a tela de máquinas usa. Assim o `done`
  // do stream não espera o Portal, e o mesmo modelo não é consultado duas
  // vezes. Sem modelo no texto, `machineTerm` fica vazio e nada é consultado.
  const [machineTerm, setMachineTerm] = useState('');
  // Motor Kawasaki reconhecido no texto (série+spec). O servidor só anuncia
  // quando a forma é inequívoca — ver utils/machine-query.ts no backend.
  const [kawasakiModel, setKawasakiModel] = useState('');
  // Motor Briggs reconhecido no texto. Só a forma com letra no bloco do modelo
  // entra — ver utils/machine-query.ts no backend.
  const [briggsModel, setBriggsModel] = useState('');
  // A máquina abre AO LADO, sem trocar de tela: o atendente confirma a posição
  // na vista explodida e volta para a lista de peças com o contexto intacto.
  const [openMachine, setOpenMachine] = useState<{ pnc: string; name: string } | null>(
    () => (initialMachinePnc ? { pnc: initialMachinePnc, name: `PNC ${initialMachinePnc}` } : null),
  );
  // Termo anunciado pelo stream -> busca oficial de máquina. Desabilitada
  // sozinha quando o termo está vazio, que é o caso da maioria das buscas.
  const machineSearch = useOfficialMachineSearch(machineTerm);
  // Máquinas com PNC abrem a vista explodida; o resto do que a Husqvarna acha
  // (acessório, documento, categoria) aparece como atalho para o Portal.
  //
  // Filtrar só `PRODUCT` foi perda de função quando a aba Máquinas saiu: lá a
  // busca oficial mostrava cinco grupos. Peça por CÓDIGO já vem pelos caminhos
  // de peça, mas acessório, documento e categoria não vêm por lugar nenhum — e
  // acessório é justamente o que o balcão vende junto.
  // O modelo PESQUISADO vem primeiro (o Portal devolve em ordem alfabética, e "522HD60S" passava na frente do "122 HD60").
  const modelTerm = useMemo(() => searchModelTerm(lastQuery, machineTerm), [lastQuery, machineTerm]);
  const machines = useMemo(
    () => rankByModel((machineSearch.data ?? []).filter(item => item.kind === 'PRODUCT' && item.pnc), modelTerm),
    [machineSearch.data, modelTerm],
  );
  const officialExtras = useMemo(
    () => (machineSearch.data ?? []).filter(item => item.kind !== 'PRODUCT' && item.portalUrl && item.documentType !== 'OM' && !/^OM\b/i.test(item.title)),
    [machineSearch.data],
  );
  // As máquinas da lista VIGENTE da Husqvarna que o texto cita entram antes de tudo: se o modelo existe na lista, ele aparece,
  // mesmo que o Portal o devolva depois (ou nem devolva). O que o Portal já trouxe pelo mesmo PNC não repete.
  const machineList = useMachineList(Boolean(machineTerm) && !/^\d+$/.test(machineTerm.replace(/\s+/g, '')));
  const listedHits = useMemo(() => {
    const portalPncs = new Set(machines.map(item => portalPnc(item.pnc ?? '')));
    return (machineList.data?.machines ?? [])
      .filter(item => modelMatchTier(item.model, modelTerm) === 0 && !portalPncs.has(portalPnc(item.pnc)))
      .slice(0, 4);
  }, [machineList.data, machines, modelTerm]);
  // Atalho para a máquina que este atendente já abriu, agora no atendimento:
  // no balcão poucas máquinas repetem muito, e redigitar o PNC da etiqueta com
  // o cliente na frente é o atrito que a tela existe para tirar.
  const { recent: recentMachines, remember: rememberMachine } = useRecentMachines(storageScope);
  const [commercialParts, setCommercialParts] = useState<CommercialPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [commercialLoading, setCommercialLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');
  const [officialResult, setOfficialResult] = useState<OfficialFallbackResult | null>(null);
  const [officialLoading, setOfficialLoading] = useState(false);
  const [detail, setDetail] = useState<PartDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [liveData, setLiveData] = useState<HusqvarnaLivePart | null>(null);
  const [pdf, setPdf] = useState<PdfPreview | null>(null);
  const [verifications, setVerifications] = useState<Record<string, OfficialVerification>>({});
  const [, setVerificationLoading] = useState(false);
  const [verificationTarget, setVerificationTarget] = useState<{ partNumber: string; name: string } | null>(null);
  const [suggestions, setSuggestions] = useState<SearchResultPart[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const suggestionsAbortRef = useRef<AbortController | null>(null);
  // A busca em andamento. Uma busca nova cancela a anterior: sem isso, a fase "por significado" da busca
  // velha chegava depois e misturava peças dela na lista da nova.
  const searchAbortRef = useRef<AbortController | null>(null);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [recentOpen, setRecentOpen] = useState(false);
  const [activeRecent, setActiveRecent] = useState(-1);
  const [showAllExtras, setShowAllExtras] = useState(false);

  const loadRecent = useCallback(() => {
    void apiJson<{ history: SearchHistoryItem[] }>('/api/history')
      .then(data => setRecent(recentSearchesFrom(data.history)))
      .catch(() => undefined);
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const loadVerifications = useCallback(async (items: Array<{ partNumber: string }>, replace = false) => {
    if (!items.length) {
      if (replace) setVerifications({});
      return;
    }
    setVerificationLoading(true);
    try {
      const codes = [...new Set(items.map(item => item.partNumber))].join(',');
      const data = await apiJson<{ verifications: OfficialVerification[] }>(`/api/part-verifications?codes=${encodeURIComponent(codes)}`);
      const next: Record<string, OfficialVerification> = {};
      for (const verification of data.verifications) {
        next[normalizePartCode(verification.queriedPartNumber)] = verification;
        next[normalizePartCode(verification.currentPartNumber)] = verification;
      }
      setVerifications(current => replace ? next : { ...current, ...next });
    } catch {
      if (replace) setVerifications({});
    } finally {
      setVerificationLoading(false);
    }
  }, []);

  const resolveSearchCode = useCallback(async (value: string) => {
    if (!looksLikePartNumber(value)) return value;
    try {
      const data = await apiJson<{ verifications: OfficialVerification[] }>(`/api/part-verifications?codes=${encodeURIComponent(value)}`);
      const verification = data.verifications[0];
      if (verification && isSupersededForCode(value, verification)) return verification.currentPartNumber;
    } catch {
      // A busca continua com o código informado se a conferência salva não responder.
    }
    return value;
  }, []);

  const buildTechnicalQuery = useCallback((value: string) => {
    const base = value.trim();
    const lowerBase = base.toLocaleLowerCase('pt-BR');
    const additions: string[] = [];
    const model = session.machineModel.trim();
    const pnc = session.pnc.trim();
    const serial = session.serial.trim();
    if (model && !lowerBase.includes(model.toLocaleLowerCase('pt-BR'))) additions.push(model);
    if (pnc) {
      const compactBase = base.replace(/\W/g, '').toLowerCase();
      const compactPnc = pnc.replace(/\W/g, '').toLowerCase();
      if (compactPnc && !compactBase.includes(compactPnc)) additions.push(pnc);
    }
    if (serial) {
      const compactBase = base.replace(/\W/g, '').toLowerCase();
      const compactSerial = serial.replace(/\W/g, '').toLowerCase();
      if (compactSerial && !compactBase.includes(compactSerial)) additions.push(`S/N ${serial}`);
    }
    return [base, ...additions].filter(Boolean).join(' ');
  }, [session.machineModel, session.pnc, session.serial]);

  const fetchCommercial = useCallback(async (value: string, section = '', signal?: AbortSignal) => {
    setCommercialLoading(true);
    try {
      const sectionQuery = section ? `&section=${encodeURIComponent(section)}` : '';
      const data = await apiJson<{ parts: CommercialPart[]; sections: PriceSection[] }>(`/api/master-parts/search?q=${encodeURIComponent(value)}${sectionQuery}`, signal ? { signal, timeoutMs: 45_000 } : { timeoutMs: 45_000 });
      if (signal?.aborted) return [];
      setCommercialParts(data.parts);
      return data.parts;
    } catch (commercialError) {
      if (commercialError instanceof Error && commercialError.name === 'AbortError') return [];
      console.error('Cadastro comercial indisponível:', commercialError);
      return [];
    } finally {
      if (!signal?.aborted) setCommercialLoading(false);
    }
  }, []);

  // Abre a máquina só quando a HUSQVARNA confirmou que aquele número é
  // máquina (`kind === 'PRODUCT_CATALOG'`), não por formato.
  //
  // É o que resolve o PNC colado, de 9 dígitos: ele é indistinguível de um
  // código de peça e por isso `machineQueryHint` se recusa a adivinhar. Aqui
  // não há palpite — a resposta vem da fonte, e a consulta já foi feita, então
  // o botão não custa nada.
  const officialMachinePnc =
    officialResult?.kind === 'PRODUCT_CATALOG' && officialResult.pnc ? officialResult.pnc : null;

  const consultOfficial = useCallback(async (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    setOfficialLoading(true);
    try {
      const data = await apiJson<{ result: OfficialFallbackResult }>(`/api/official-fallback?q=${encodeURIComponent(clean)}`, { timeoutMs: 20_000 });
      setOfficialResult(data.result);
    } catch (officialError) {
      setOfficialResult({ status: 'REVIEW', source: 'ONLINE', query: clean, url: 'https://www.husqvarna.com/br/pecas-sobressalentes/', message: officialError instanceof Error ? officialError.message : 'A consulta oficial não respondeu.' });
    } finally {
      setOfficialLoading(false);
    }
  }, []);

  const runSearch = useCallback(async (value: string, externalSignal?: AbortSignal) => {
    const clean = value.trim();
    if (clean.length < 2) return;
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    externalSignal?.addEventListener('abort', () => controller.abort(), { once: true });
    const signal = controller.signal;
    setLoading(true);
    setHasSearched(true);
    setLastQuery(clean);
    setError('');
    setParts([]);
    setDocuments([]);
    setMachineTerm('');
    setKawasakiModel('');
    setBriggsModel('');
    setCommercialParts([]);
    setOfficialResult(null);
    setVerifications({});

    try {
      const resolvedQuery = await resolveSearchCode(clean);
      if (signal?.aborted) return;
      const technicalQuery = buildTechnicalQuery(resolvedQuery);
      const commercialPromise = fetchCommercial(resolvedQuery, '', signal);
      // Cadastro de preços respondeu com peças: o balcão já tem o que vender, mesmo que a busca técnica
      // ainda esteja na fase "por significado".
      void commercialPromise.then(found => { if (found.length > 0 && !signal.aborted) setLoading(false); }).catch(() => {});
      // `typed` é o texto do atendente; `q` leva o contexto anexado. O
      // servidor precisa dos dois: o contexto melhora a busca de peça, e a
      // decisão de consultar máquina tem que olhar o que foi digitado.
      const response = await api(`/api/search/stream?q=${encodeURIComponent(technicalQuery)}&typed=${encodeURIComponent(clean)}`, signal ? { signal, timeoutMs: 60_000 } : { timeoutMs: 60_000 });
      if (!response.ok) throw new Error('Não foi possível concluir a pesquisa técnica.');

      let accumulated: SearchResultPart[] = [];
      await consumeSearchStream(response, signal, message => {
        if (message.type === 'lexical') {
          if (message.error) {
            setError(message.error);
            return;
          }
          accumulated = (message.parts ?? []).map(part => ({ ...part, source: 'CATALOG' as const }));
          setParts(accumulated);
          setDocuments(message.documents ?? []);
          // Já há peças na tela: o balcão não precisa esperar a fase "por significado" (até alguns segundos,
          // esperando a IA) para buscar de novo. Sem peças, continua "Buscando…" para não mostrar "nada achado" cedo.
          if (accumulated.length > 0 && !signal.aborted) setLoading(false);
          return;
        }
        if (message.type === 'machines') {
          // PNC lido da máscara de etiqueta é resposta, não lista: abre a
          // máquina direto, que é o que o atendente com a etiqueta na mão quer.
          if (message.machinePnc) {
            setOpenMachine({ pnc: message.machinePnc, name: `PNC ${message.machinePnc}` });
            return;
          }
          setMachineTerm(message.machineTerm ?? '');
          setKawasakiModel(message.kawasakiModel ?? '');
          setBriggsModel(message.briggsModel ?? '');
          return;
        }
        if (message.type === 'semantic') {
          const semantic = (message.parts ?? []).map(part => ({ ...part, source: 'CATALOG' as const }));
          setParts(current => {
            const existingIds = new Set(current.map(part => part.id));
            const additions = semantic.filter(part => !existingIds.has(part.id));
            accumulated = [...current, ...additions];
            return accumulated;
          });
        }
      });

      const commercial = await commercialPromise;
      if (signal?.aborted) return;
      if (accumulated.length > 0) void loadVerifications(accumulated, true);
      else if (!commercial[0]) await consultOfficial(resolvedQuery);
    } catch (searchError) {
      if (searchError instanceof Error && searchError.name === 'AbortError') return;
      setError(searchError instanceof Error ? searchError.message : 'Erro ao pesquisar.');
      const commercial = await fetchCommercial(clean, '', signal);
      if (!signal?.aborted && !commercial.length) await consultOfficial(clean);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [buildTechnicalQuery, consultOfficial, fetchCommercial, loadVerifications, resolveSearchCode]);

  useEffect(() => {
    const value = initialQuery.trim();
    if (value.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void runSearch(value, controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [initialQuery, runSearch]);

  useEffect(() => {
    const nextRevision = `${session.machineModel}\u0000${session.pnc}\u0000${session.serial}`;
    if (contextRevisionRef.current === nextRevision) return;
    contextRevisionRef.current = nextRevision;
    if (!hasSearched || lastQuery.length < 2) return;
    const timer = window.setTimeout(() => void runSearch(lastQuery), 450);
    return () => window.clearTimeout(timer);
  }, [hasSearched, lastQuery, runSearch, session.machineModel, session.pnc, session.serial]);

  useEffect(() => {
    const trimmed = query.trim();
    suggestionsAbortRef.current?.abort();
    if (!looksLikePartNumber(trimmed) || trimmed === lastQuery) {
      const clearTimer = window.setTimeout(() => {
        setSuggestions([]);
        setActiveSuggestion(-1);
      }, 0);
      return () => window.clearTimeout(clearTimer);
    }
    const controller = new AbortController();
    suggestionsAbortRef.current = controller;
    const timer = window.setTimeout(async () => {
      try {
        const response = await api(`/api/search/stream?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal, timeoutMs: 8_000 });
        if (controller.signal.aborted || !response.ok) return;
        let found: SearchResultPart[] = [];
        await consumeSearchStream(response, controller.signal, message => {
          if (message.type === 'lexical' && !message.error) found = (message.parts ?? []).slice(0, 6).map(part => ({ ...part, source: 'CATALOG' as const }));
        });
        if (controller.signal.aborted) return;
        setSuggestions(found);
        setActiveSuggestion(-1);
        setSuggestionsOpen(found.length > 0);
      } catch {
        // Sugestão instantânea é conveniência, não a busca em si; falha aqui não deve incomodar o atendente.
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, lastQuery]);

  const closeSuggestions = useCallback(() => {
    suggestionsAbortRef.current?.abort();
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
  }, []);

  const selectSuggestion = useCallback((part: SearchResultPart) => {
    closeSuggestions();
    setQuery(part.partNumber);
    if (part.partNumber.trim() !== initialQuery.trim()) onQueryChange(part.partNumber);
    else void runSearch(part.partNumber);
  }, [closeSuggestions, initialQuery, onQueryChange, runSearch]);

  const hasLocalResults = parts.length > 0 || commercialParts.length > 0;
  // Uma linha por código. O cadastro de preços só mostra o que o catálogo ainda não mostrou: a mesma
  // peça, com o mesmo preço, em dois grupos era a mesma linha duas vezes.
  const partGroups = useMemo(() => groupPartsByCode(parts), [parts]);
  const visibleCommercial = useMemo(() => {
    const shown = new Set(partGroups.map(group => normalizePartCode(group.main.partNumber)));
    return commercialParts.filter(item => !shown.has(normalizePartCode(item.partNumber)));
  }, [commercialParts, partGroups]);
  const hasCommercialGroup = visibleCommercial.length > 0 || commercialLoading;
  const showGroupHeaders = partGroups.length > 0 && hasCommercialGroup;
  // Vem primeiro o grupo que tem o NOME que o cliente falou. "vela de ignição" achava 21 chaves e
  // fivelas no catálogo e deixava as velas de verdade, do cadastro, lá embaixo.
  // Conta quantas peças de cada grupo têm esse nome (44 velas contra 1 plugue de teste); empate fica com o catálogo.
  const commercialFirst = visibleCommercial.filter(item => nameContainsPhrase(item.name, lastQuery)).length
    > partGroups.filter(group => nameContainsPhrase(group.main.name, lastQuery)).length;
  // Atalhos de documento: o manual em português primeiro, o manual antes da lista de peças, sem repetir.
  const sortedExtras = useMemo(() => {
    const seen = new Set<string>();
    return [...officialExtras]
      .filter(item => { const key = `${item.title}|${item.languages.join(',')}`; if (seen.has(key)) return false; seen.add(key); return true; })
      .sort((a, b) => extraRank(a) - extraRank(b));
  }, [officialExtras]);
  // O documento do modelo pesquisado ("IPL, 122 HD60") passa na frente dos de outras máquinas.
  const rankedExtras = useMemo(() => rankByModel(sortedExtras, modelTerm), [sortedExtras, modelTerm]);

  const copyCode = useCallback(async (code: string) => {
    const raw = cleanErpCode(code);
    try {
      await navigator.clipboard.writeText(raw);
      playCopySound();
      toast.success(`Código ${raw} copiado.`);
    } catch {
      toast.info(`Código: ${raw}`);
    }
  }, []);

  const beginSearch = useCallback((value: string) => {
    const clean = value.trim();
    if (clean.length < 2) return;
    closeSuggestions();
    setQuery(clean);
    if (clean !== initialQuery.trim()) onQueryChange(clean);
    else void runSearch(clean);
  }, [closeSuggestions, initialQuery, onQueryChange, runSearch]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeSuggestion >= 0 && suggestions[activeSuggestion]) {
      selectSuggestion(suggestions[activeSuggestion]);
      return;
    }
    if (query.trim().length < 2) {
      setError('Digite ao menos 2 caracteres.');
      inputRef.current?.focus();
      return;
    }
    beginSearch(query);
  };

  const clearSearch = () => {
    closeSuggestions();
    setQuery('');
    setLastQuery('');
    setParts([]);
    setDocuments([]);
    setMachineTerm('');
    setKawasakiModel('');
    setBriggsModel('');
    setCommercialParts([]);
    setOfficialResult(null);
    setHasSearched(false);
    setError('');
    onQueryChange('');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openPart = useCallback(async (id: string) => {
    setDetailLoadingId(id);
    setError('');
    setLiveData(null);
    try {
      const data = await apiJson<{ part: PartDetail }>(`/api/parts/${id}`);
      setDetail(data.part);
      void loadVerifications([data.part]);
      void apiJson<{ livePart: HusqvarnaLivePart }>(`/api/parts/${encodeURIComponent(data.part.partNumber)}/live-data`)
        .then(response => setLiveData(response.livePart))
        .catch(() => undefined);
    } catch (partError) {
      setError(partError instanceof Error ? partError.message : 'Não foi possível abrir a peça.');
    } finally {
      setDetailLoadingId(null);
    }
  }, [loadVerifications]);

  const accessPdf = useCallback(async (documentId: string, page: number | null, title: string) => {
    try {
      const data = await apiJson<{ url: string }>(`/api/documents/${documentId}/access?mode=view`);
      setPdf({ url: data.url, page, title });
    } catch (pdfError) {
      toast.error(pdfError instanceof Error ? pdfError.message : 'Não foi possível abrir o catálogo.');
    }
  }, []);


  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (pdf) setPdf(null);
        else if (verificationTarget) setVerificationTarget(null);
        // A gaveta da peça é um Sheet do Radix e fecha o próprio Esc. Fechá-la aqui também fazia o Esc que
        // fecha o menu "⋯" levar a gaveta junto.
        return;
      }
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detail, pdf, verificationTarget]);

  const detailVerification = detail ? verifications[normalizePartCode(detail.partNumber)] : undefined;

  return (
    <section className="flex flex-1 flex-col gap-4">
      <h1 className="sr-only">Atendimento</h1>
      <p role="status" className="sr-only">{loading ? 'Buscando…' : hasSearched ? `${parts.length + commercialParts.length} resultados` : ''}</p>

      {/* Painel de busca: o campo é o protagonista; cliente, máquina e PNC do atendimento ficam logo abaixo, na mesma peça. */}
      <div className="rounded-2xl border border-border bg-card shadow-sm">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
        <div className="relative min-w-0 basis-full sm:basis-0 sm:flex-1">
          <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setActiveRecent(-1);
              setRecentOpen(!event.target.value.trim() && recent.length > 0);
            }}
            onFocus={() => {
              if (suggestions.length > 0) setSuggestionsOpen(true);
              if (!query.trim()) { loadRecent(); setRecentOpen(recent.length > 0); }
            }}
            onBlur={() => { setSuggestionsOpen(false); setRecentOpen(false); }}
            onKeyDown={event => {
              if (recentOpen && recent.length) {
                if (event.key === 'ArrowDown') { event.preventDefault(); setActiveRecent(current => (current + 1) % recent.length); return; }
                if (event.key === 'ArrowUp') { event.preventDefault(); setActiveRecent(current => (current <= 0 ? recent.length - 1 : current - 1)); return; }
                if (event.key === 'Enter' && activeRecent >= 0) { event.preventDefault(); setRecentOpen(false); beginSearch(recent[activeRecent].replay); return; }
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setRecentOpen(false); return; }
              }
              // Sem sugestões abertas, ↓ leva à primeira peça da lista (teclado primeiro).
              if (event.key === 'ArrowDown' && !(suggestionsOpen && suggestions.length)) {
                if (focusFirstResult()) event.preventDefault();
                return;
              }
              if (!suggestionsOpen || !suggestions.length) return;
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveSuggestion(current => (current + 1) % suggestions.length);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveSuggestion(current => (current <= 0 ? suggestions.length - 1 : current - 1));
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeSuggestions();
              }
            }}
            placeholder={hasContext ? 'Peça, código ou pergunta sobre este equipamento…' : 'Código, peça ou modelo…'}
            name="busca"
            spellCheck={false}
            /* O campo principal do produto não tinha rótulo, só placeholder, que some
               quando o atendente digita. */
            aria-label="Buscar peça, código ou modelo"
            autoComplete="off"
            role="combobox"
            aria-expanded={(suggestionsOpen && suggestions.length > 0) || (recentOpen && recent.length > 0 && !query.trim())}
            aria-controls="parts-search-suggestions"
            aria-autocomplete="list"
            className="h-14 rounded-xl bg-background pl-12 pr-20 text-xl font-medium"
          />
          {!query && <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 text-sm text-muted-foreground">Ctrl&nbsp;K</kbd>}
          {recentOpen && recent.length > 0 && !query.trim() && (
            <RecentSearchesDropdown recent={recent} activeIndex={activeRecent} onPick={value => { setRecentOpen(false); beginSearch(value); }} />
          )}
          {suggestionsOpen && suggestions.length > 0 && (
            <div id="parts-search-suggestions">
              <SuggestionsDropdown suggestions={suggestions} activeIndex={activeSuggestion} onPick={selectSuggestion} />
            </div>
          )}
        </div>
        {query && <Button type="button" variant="ghost" size="lg" onClick={clearSearch} className="h-14">Limpar</Button>}
        <Button type="submit" size="lg" disabled={loading} className="h-14 min-w-36 px-8 text-xl">{loading ? 'Buscando…' : 'Buscar'}</Button>
      </form>
      <div className="border-t border-border">
        <CounterSessionBar onOpenMachine={pnc => setOpenMachine({ pnc, name: session.machineModel || `PNC ${pnc}` })} />
      </div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-base font-medium text-destructive">{error}</div>}

      {/* Máquina e documentos viram atalhos pequenos, em uma linha: a peça buscada vem
          primeiro. Antes eram uma lista de 12 linhas na frente do resultado. */}
      {(machines.length > 0 || listedHits.length > 0 || sortedExtras.length > 0 || (hasSearched && recentMachines.length > 0)) && (
        <div className="flex flex-wrap items-center gap-2">
          {/* A máquina que já está no contexto ou nos atalhos desta busca não repete como "recente". */}
          {(hasSearched ? recentMachines : []).filter(item => item.pnc !== session.pnc && !machines.some(found => found.pnc === item.pnc)).map(item => (
            <Button key={item.pnc} variant="outline" size="sm" onClick={() => setOpenMachine({ pnc: item.pnc, name: item.name })} title={item.meta || `PNC ${item.pnc}`} className="max-w-64">
              <span className="truncate">{item.name}</span>
            </Button>
          ))}
          {listedHits.map(item => (
            <Button
              key={`lista-${item.pnc}`}
              variant="outline"
              size="sm"
              onClick={() => {
                updateSession({ machineModel: item.model, pnc: portalPnc(item.pnc) });
                setOpenMachine({ pnc: portalPnc(item.pnc), name: `Husqvarna ${item.model}` });
              }}
              title={`${item.description} · na lista vigente`}
              className="max-w-full border-primary/50 sm:max-w-[28rem]"
            >
              <Icon name="machine" className="size-4" />
              <span className="truncate font-semibold">{item.model}</span>
              <span className="font-code text-sm font-medium text-muted-foreground tabular-nums">PNC {portalPnc(item.pnc)}</span>
            </Button>
          ))}
          {machines.map(item => (
            <Button
              key={item.id}
              variant="outline"
              size="sm"
              onClick={() => {
                // O contexto do atendimento passa a valer para as buscas seguintes.
                updateSession({ machineModel: item.title, pnc: item.pnc || '' });
                setOpenMachine({ pnc: item.pnc as string, name: item.title });
              }}
              title={[item.categoryName || item.subtitle, item.discontinued ? 'fora de linha' : null].filter(Boolean).join(' · ')}
              className="max-w-full border-primary/50 sm:max-w-[28rem]"
            >
              <Icon name="machine" className="size-4" />
              <span className="truncate">
                <span className="font-semibold">{machineChipLabel(item.title).model}</span>
                {machineChipLabel(item.title).kind && <span className="font-normal text-muted-foreground"> · {machineChipLabel(item.title).kind}</span>}
              </span>
              <span className="font-code text-sm font-medium text-muted-foreground tabular-nums">PNC {item.pnc}</span>
            </Button>
          ))}
          {(showAllExtras ? rankedExtras : rankedExtras.slice(0, 3)).map(item => (
            <Button key={`${item.kind}-${item.id}`} variant="outline" size="sm" asChild className="max-w-full sm:max-w-72">
              <a
                href={item.portalUrl as string}
                target="_blank"
                rel="noreferrer noopener"
                title={[OFFICIAL_KIND_LABELS[item.kind], item.title, item.languages.join(', ') || null, item.discontinued ? 'fora de linha' : null].filter(Boolean).join(' · ')}
              >
                <Icon name="pdf" className="size-4 text-muted-foreground" />
                <span className="truncate">{item.title}</span>
              </a>
            </Button>
          ))}
          {rankedExtras.length > 3 && (
            <Button variant="ghost" size="sm" onClick={() => setShowAllExtras(value => !value)} aria-expanded={showAllExtras}>
              {showAllExtras ? 'Mostrar menos' : `Mais ${rankedExtras.length - 3}`}
            </Button>
          )}
        </div>
      )}

      <div className="grid flex-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {!hasSearched && <Starter onExample={beginSearch} recent={recent} onReplay={beginSearch} machines={recentMachines} onOpenMachine={item => setOpenMachine(item)} />}
          {loading && !hasLocalResults ? <ResultsSkeleton /> : null}
          {hasSearched && <OilQuickAdd query={lastQuery} machineModel={session.machineModel.trim() || undefined} />}

          {/* Código digitado que a Husqvarna já trocou: mostra o novo antes da lista (consulta sozinha). */}
          {hasSearched && <CodeReplacementCheck query={lastQuery} machineModel={session.machineModel.trim() || undefined} onCopy={code => void copyCode(code)} />}

          {/* Motor Kawasaki: os códigos E a vista explodida de cada conjunto. Vem antes
              porque, quando o atendente digitou o modelo do motor, é o catálogo dele que
              responde. */}
          {kawasakiModel && <KawasakiEnginePanel model={kawasakiModel} onSearchPart={beginSearch} />}
          {briggsModel && <BriggsEnginePanel model={briggsModel} onSearchPart={beginSearch} />}

          {/* Caminho inverso: o cliente chegou com o código e não com a máquina. Responde
              do índice local do que já foi lido dos catálogos Briggs/Kawasaki, sem consultar
              o fabricante. */}
          {hasSearched && <OfficialPartOrigin code={lastQuery} onSearchPart={beginSearch} />}

          {(partGroups.length > 0 || hasCommercialGroup) && (
            <ResultsTable>
              {partGroups.length > 0 && (
                <ResultsGroup title="No catálogo" order={commercialFirst ? 2 : 1} showHeader={showGroupHeaders} count={`${partGroups.length} resultado${partGroups.length === 1 ? '' : 's'}`}>
                  {partGroups.map(({ main: part, others }) => (
                    <PartResultRow
                      key={part.id}
                      part={part}
                      others={others}
                      verification={verifications[normalizePartCode(part.partNumber)]}
                      opening={detailLoadingId === part.id}
                      onOpen={() => void openPart(part.id)}
                      onCopy={code => void copyCode(code)}
                    />
                  ))}
                </ResultsGroup>
              )}

              {hasCommercialGroup && (
                <ResultsGroup
                  title="Cadastro de preços"
                  order={commercialFirst ? 1 : 2}
                  showHeader={showGroupHeaders}
                  count={commercialLoading ? 'Consultando…' : `${visibleCommercial.length} resultado${visibleCommercial.length === 1 ? '' : 's'}`}
                >
                  {visibleCommercial.map(part => <CommercialPartRow key={part.id} part={part} onCopy={code => void copyCode(code)} onOfficial={item => void consultOfficial(item.partNumber)} />)}
                  {commercialParts.length === COMMERCIAL_RESULTS_CAP && (
                    <div className="border-t border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                      Mostrando os {COMMERCIAL_RESULTS_CAP} primeiros. Refine a busca para ver os demais.
                    </div>
                  )}
                </ResultsGroup>
              )}
            </ResultsTable>
          )}

          {/* O cliente descreveu a peça com as palavras dele e a busca não achou nada. A IA
              escolhe de uma lista FECHADA (as peças daquela máquina) e o desenho confirma.
              Vem antes do painel de "não achei" porque é uma resposta, e o painel é a
              ausência dela. A máquina sai do contexto do atendimento: sem máquina não há
              lista fechada, e nada é consultado. */}
          {hasSearched && !loading && !commercialLoading && !hasLocalResults && (session.machineModel.trim() || machineTerm) && (
            <PartGuesses
              model={session.machineModel.trim() || machineTerm}
              query={lastQuery}
              onOpenPart={beginSearch}
            />
          )}

          {hasSearched && !loading && !commercialLoading && !hasLocalResults && (
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  {officialLoading ? (
                    <p className="text-base text-muted-foreground">Consultando a Husqvarna…</p>
                  ) : officialResult?.status === 'FOUND' ? (
                    <>
                      <h2 className="text-xl font-semibold">{officialResult.name}</h2>
                      {officialResult.partNumber && <div className="font-code text-2xl font-semibold tabular-nums">{cleanErpCode(officialResult.partNumber)}</div>}
                      {officialResult.message && <p className="max-w-2xl text-base text-muted-foreground">{officialResult.message}</p>}
                    </>
                  ) : (
                    <>
                      <h2 className="text-xl font-semibold">Nenhuma peça encontrada</h2>
                      {officialResult?.message && <p className="max-w-2xl text-base text-muted-foreground">{officialResult.message}</p>}
                    </>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {officialMachinePnc && (
                    <Button onClick={() => setOpenMachine({ pnc: officialMachinePnc, name: officialResult?.name || `PNC ${officialMachinePnc}` })}>Abrir vista explodida</Button>
                  )}
                  {officialResult?.partNumber && <Button variant="outline" onClick={() => void copyCode(officialResult.partNumber!)}>Copiar código</Button>}
                </div>
              </div>
            </section>
          )}

          {documents.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-base font-semibold">Catálogos relacionados{documents.length > 4 ? <span className="ml-2 text-sm font-normal text-muted-foreground">+{documents.length - 4}</span> : null}</h2>
              <div className="grid gap-2 md:grid-cols-2">
                {documents.slice(0, 4).map(document => (
                  <Button key={document.id} variant="outline" onClick={() => void accessPdf(document.id, null, document.filename)} className="h-auto flex-col items-start gap-0 py-2.5 text-left">
                    <span className="w-full truncate text-base font-semibold">{document.filename}</span>
                    <span className="text-sm font-normal text-muted-foreground">{document.model || 'Modelo não informado'} · {document.partCount} peças</span>
                  </Button>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="min-w-0 xl:sticky xl:top-[72px] xl:self-start">
          <CounterQuoteRail />
        </aside>
      </div>

      {/* A `key` remonta a barreira a cada máquina: sem ela, um erro numa
          máquina deixaria o painel travado no aviso para todas as seguintes. */}
      {openMachine && (
        <PanelErrorBoundary key={`maquina-${openMachine.pnc}`} onClose={() => setOpenMachine(null)}>
          <MachineSidePanel
            pnc={openMachine.pnc}
            contextModel={openMachine.name}
            onClose={() => setOpenMachine(null)}
            onOpenPnc={pnc => setOpenMachine({ pnc, name: `PNC ${pnc}` })}
            onOpenPart={code => { setOpenMachine(null); void beginSearch(code); }}
            onLoaded={rememberMachine}
          />
        </PanelErrorBoundary>
      )}

      {detail && <PanelErrorBoundary key={`peca-${detail.partNumber}`} onClose={() => setDetail(null)}><PartDetailDrawer detail={detail} verification={detailVerification} liveData={liveData} onClose={() => setDetail(null)} onCopy={code => void copyCode(code)} onOpenPdf={(documentId, page, title) => void accessPdf(documentId, page, title)} onOpenRelated={id => void openPart(id)} onVerify={() => setVerificationTarget({ partNumber: detail.partNumber, name: detail.name })} escapeBlocked={Boolean(pdf) || Boolean(verificationTarget)} /></PanelErrorBoundary>}
      {verificationTarget && <PartVerificationDialog target={verificationTarget} existing={verifications[normalizePartCode(verificationTarget.partNumber)]} onClose={() => setVerificationTarget(null)} onSaved={() => { setVerificationTarget(null); toast.success('Conferência enviada para aprovação.'); if (detail) void loadVerifications([detail]); }} />}

      {pdf && (
        <div className="fixed inset-0 z-90 bg-ink-950/90 p-3 md:p-5">
          <div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white dark:bg-ink-900">
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-800"><div className="truncate text-sm font-black">{pdf.title}</div><button type="button" onClick={() => setPdf(null)} className="rounded-lg border border-ink-200 px-3 py-2 text-xs font-bold dark:border-ink-700">Fechar</button></div>
            <iframe title={pdf.title} src={`${pdf.url}${pdf.page ? `#page=${pdf.page}` : ''}`} className="h-full w-full border-0" />
          </div>
        </div>
      )}
    </section>
  );
}
