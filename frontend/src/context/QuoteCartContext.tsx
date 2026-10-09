import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { jsPDF as JsPdf } from 'jspdf';
import { apiJson } from '../lib';
import { playCartSound } from '../lib/sound';
import { buildWhatsAppMessage } from '../lib/quote-message';
import { composeQuoteMachine, splitQuoteMachine } from '../lib/quote-engine';
import { quoteStorageScopeFromSession } from '../lib/quote-storage-scope';

export interface QuoteCartItem {
  id: string; // unique key: `${partNumber}|${manufacturer || ''}|${model}|${pnc || ''}`
  partNumber: string;
  effectiveCode?: string;
  manufacturer?: string | null;
  name: string;
  model: string;
  pnc?: string | null;
  section?: string | null;
  position?: string | null;
  filename?: string | null;
  page?: number | null;
  isSuperseded?: boolean;
  originalCode?: string;
  notes?: string | null;
  /** Prazo desta linha; vazio = vale o prazo do orçamento. */
  leadTime?: string;
  /** Prateleira da peça (vem dos orçamentos antigos). Só do balcão: nunca sai no PDF nem no WhatsApp. */
  location?: string;
  quantity: number;
  unitPrice?: number;
}

export interface QuoteTextOptions {
  /** Tipo do orçamento: peças (padrão) ou conserto. Vale para o orçamento inteiro, até esvaziar e trocar. */
  kind?: 'PARTS' | 'REPAIR';
  /** Número digitado pelo balcão (no conserto, o da OS do Clipp). Em branco por padrão: a loja numera, o sistema não. */
  docNumber?: string;
  machineModel?: string;
  /** Motor da máquina ("Kawasaki FX921V-ES06"); no banco viaja junto de machineModel (lib/quote-engine.ts). */
  engine?: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: string;
  /** Prazo das peças: "Imediato", o prazo da encomenda (ex.: "7 a 10 dias") ou vazio = orçamento expresso, sem prazo. */
  leadTime?: string;
  /** Observações do orçamento. Vazio = as observações padrão da loja. */
  notes?: string;
  discountPercentage?: number;
}

/** O que a prévia do PDF pode ajustar além do que a gaveta já guarda: a data do orçamento (a validade conta dela), o assunto ("Ref.") e a validade. */
export interface QuotePdfExtras {
  quoteDate?: Date;
  reference?: string;
  validityDays?: number;
  company?: string;
  quoteNumber?: string;
  customerNotes?: string;
}

export interface SavedQuote {
  id: string;
  kind?: 'PARTS' | 'REPAIR';
  docNumber?: string;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: string;
  leadTime?: string;
  notes?: string;
  machineModel?: string;
  discountPercentage?: number;
  items: QuoteCartItem[];
  totalPrice: number;
  totalItems: number;
  attendantEmail?: string | null;
  attendantName?: string | null;
}

/**
 * Onde o orçamento está guardado neste instante. O balcão precisa saber a
 * diferença: `offline` significa "se você trocar de aparelho agora, esses itens
 * não estão lá". Antes disso ser visível, o atendente não tinha como saber.
 */
export type QuoteSyncState = 'loading' | 'synced' | 'saving' | 'offline';

interface QuoteCartContextType {
  items: QuoteCartItem[];
  addItem: (item: Omit<QuoteCartItem, 'quantity' | 'id'> & { quantity?: number }) => void;
  addItems: (items: Array<Omit<QuoteCartItem, 'quantity' | 'id'> & { quantity?: number }>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  updateUnitPrice: (id: string, price: number | undefined) => void;
  /** Prazo só desta linha (vazio = o do orçamento). */
  updateLeadTime: (id: string, leadTime: string | undefined) => void;
  clearCart: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  totalItems: number;
  totalPrice: number;
  generateWhatsAppText: (optionsOrModel?: string | QuoteTextOptions) => string;
  openWhatsApp: (optionsOrModel?: string | QuoteTextOptions) => void;
  generatePdfQuote: (optionsOrModel?: string | QuoteTextOptions) => Promise<void>;
  /** Monta o PDF do cliente SEM baixar nem arquivar (a prévia remonta a cada ajuste). */
  createPdfQuote: (options?: QuoteTextOptions & QuotePdfExtras) => Promise<JsPdf | null>;
  savedQuotes: SavedQuote[];
  saveCurrentQuote: (options?: QuoteTextOptions) => Promise<SavedQuote | null>;
  restoreQuote: (savedQuote: SavedQuote) => void;
  deleteSavedQuote: (id: string) => Promise<void>;
  clearSavedQuotes: () => Promise<void>;
  refreshSavedQuotes: () => Promise<void>;
  syncState: QuoteSyncState;
  /** Dados do cliente/pagamento da cesta, persistidos junto com os itens. */
  draftOptions: QuoteTextOptions;
  setDraftOptions: (options: QuoteTextOptions) => void;
}

const QuoteCartContext = createContext<QuoteCartContextType | null>(null);

// Chaves históricas mantidas: `lib/quote-storage-scope.ts` troca o conteúdo
// delas por usuário antes do provider montar. Hoje são cache offline, não a
// fonte de verdade — essa passou a ser a API (`/api/quotes/draft`).
// Cada tipo de orçamento tem a SUA cesta: o de peças (Atendimento) e o de conserto (aba Conserto) nunca se misturam, nem no cache do navegador nem no
// rascunho do servidor (`/api/quotes/draft?kind=`).
export type QuoteCartKind = 'PARTS' | 'REPAIR';
// `unsynced` guarda a hora da última edição que o servidor AINDA não recebeu: com ela, o que o balcão digitou sem rede (ou com a sessão caída) não é
// descartado quando a página reabre e o servidor responde com a versão antiga. As quatro chaves andam por usuário em `lib/quote-storage-scope.ts`.
const STORAGE_KEYS: Record<QuoteCartKind, { cart: string; options: string; history: string; unsynced: string }> = {
  PARTS: { cart: 'cognivault_quote_cart', options: 'cognivault_quote_draft_options', history: 'cognivault_quote_history', unsynced: 'cognivault_quote_unsynced' },
  REPAIR: { cart: 'cognivault_repair_cart', options: 'cognivault_repair_draft_options', history: 'cognivault_repair_history', unsynced: 'cognivault_repair_unsynced' },
};
/** Depois de quanto tempo uma edição "não enviada" deixa de valer mais que o servidor (outro aparelho pode ter mexido). */
const UNSYNCED_MAX_AGE_MS = 48 * 3600 * 1000;

const DRAFT_SYNC_DEBOUNCE_MS = 900;

/**
 * Espera crescente entre reenvios da cesta depois de uma falha de gravação.
 *
 * Somados dão ~1,5 min, que cobre o cold start do Render free (~50 s) e uma
 * queda curta do wi-fi da loja. **Não é infinita de propósito**: passado isso,
 * o aviso "Só neste aparelho" na gaveta é a resposta honesta, e qualquer
 * edição nova reenvia o estado inteiro de qualquer forma.
 */
const DRAFT_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000, 30_000];
const RECENT_QUOTES_PAGE_SIZE = 25;

interface ApiQuoteItem {
  id: string;
  partNumber: string;
  effectiveCode: string | null;
  manufacturer: string | null;
  name: string;
  model: string | null;
  pnc: string | null;
  section: string | null;
  position: string | null;
  filename: string | null;
  page: number | null;
  isSuperseded: boolean;
  originalCode: string | null;
  notes: string | null;
  isService: boolean;
  leadTime?: string | null;
  location?: string | null;
  quantity: number;
  unitPrice: number | null;
}

interface ApiQuote {
  id: string;
  status: 'DRAFT' | 'SAVED';
  kind?: string;
  docNumber?: string | null;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string | null;
  leadTime: string | null;
  machineModel: string | null;
  notes: string | null;
  discountPercentage: number;
  totalItems: number;
  grossTotal: number;
  discountAmount: number;
  netTotal: number;
  createdAt: string;
  updatedAt: string;
  savedAt: string | null;
  attendantId: string | null;
  attendantEmail: string | null;
  attendantName?: string | null;
  items: ApiQuoteItem[];
}

function cartItemKey(partNumber: string, manufacturer: string | null | undefined, model: string | null | undefined, pnc: string | null | undefined): string {
  return `${partNumber}|${manufacturer || ''}|${model || ''}|${pnc || ''}`;
}

function fromApiItems(items: ApiQuoteItem[]): QuoteCartItem[] {
  return items.map(item => ({
    id: cartItemKey(item.partNumber, item.manufacturer, item.model, item.pnc),
    partNumber: item.partNumber,
    effectiveCode: item.effectiveCode ?? undefined,
    manufacturer: item.manufacturer,
    name: item.name,
    model: item.model ?? '',
    pnc: item.pnc,
    section: item.section,
    position: item.position,
    filename: item.filename,
    page: item.page,
    isSuperseded: item.isSuperseded,
    originalCode: item.originalCode ?? undefined,
    notes: item.notes,
    leadTime: item.leadTime ?? undefined,
    location: item.location ?? undefined,
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? undefined,
  }));
}

function toApiItems(items: QuoteCartItem[]) {
  return items.map(item => ({
    partNumber: item.partNumber,
    effectiveCode: item.effectiveCode ?? null,
    manufacturer: item.manufacturer ?? null,
    name: item.name,
    model: item.model || null,
    pnc: item.pnc ?? null,
    section: item.section ?? null,
    position: item.position ?? null,
    filename: item.filename ?? null,
    page: item.page ?? null,
    isSuperseded: item.isSuperseded ?? false,
    originalCode: item.originalCode ?? null,
    notes: item.notes ?? null,
    isService: item.partNumber.toUpperCase().startsWith('SRV-'),
    leadTime: item.leadTime?.trim() || null,
    location: item.location?.trim() || null,
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? null,
  }));
}

function toApiOptions(options: QuoteTextOptions) {
  return {
    kind: options.kind ?? 'PARTS',
    docNumber: options.docNumber?.trim() || null,
    customerName: options.customerName?.trim() || null,
    customerPhone: options.customerPhone?.trim() || null,
    paymentMethod: options.paymentMethod || null,
    leadTime: options.leadTime?.trim() || null,
    notes: options.notes?.trim() || null,
    machineModel: composeQuoteMachine(options.machineModel, options.engine) || null,
    discountPercentage: options.discountPercentage ?? 0,
  };
}

function fromApiOptions(quote: ApiQuote): QuoteTextOptions {
  const { machine, engine } = splitQuoteMachine(quote.machineModel);
  return {
    kind: quote.kind === 'REPAIR' ? 'REPAIR' : 'PARTS',
    docNumber: quote.docNumber ?? undefined,
    customerName: quote.customerName ?? undefined,
    customerPhone: quote.customerPhone ?? undefined,
    paymentMethod: quote.paymentMethod ?? undefined,
    leadTime: quote.leadTime ?? undefined,
    notes: quote.notes ?? undefined,
    machineModel: machine || undefined,
    engine: engine || undefined,
    discountPercentage: quote.discountPercentage || 0,
  };
}

function toSavedQuote(quote: ApiQuote): SavedQuote {
  return {
    id: quote.id,
    kind: quote.kind === 'REPAIR' ? 'REPAIR' : 'PARTS',
    docNumber: quote.docNumber ?? undefined,
    createdAt: quote.savedAt || quote.createdAt,
    customerName: quote.customerName ?? undefined,
    customerPhone: quote.customerPhone ?? undefined,
    paymentMethod: quote.paymentMethod ?? undefined,
    leadTime: quote.leadTime ?? undefined,
    notes: quote.notes ?? undefined,
    machineModel: quote.machineModel ?? undefined,
    discountPercentage: quote.discountPercentage || undefined,
    items: fromApiItems(quote.items),
    totalPrice: quote.grossTotal,
    totalItems: quote.totalItems,
    attendantEmail: quote.attendantEmail,
    attendantName: quote.attendantName,
  };
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cota de armazenamento local estourada não pode travar o atendimento.
  }
}

export function QuoteCartProvider({ children, kind = 'PARTS' }: { children: ReactNode; kind?: QuoteCartKind }) {
  const keys = STORAGE_KEYS[kind];
  // O tipo é do provedor, nunca do estado: tudo que sai daqui (servidor, PDF, WhatsApp) leva o tipo certo.
  const apiOptions = useCallback((options: QuoteTextOptions) => toApiOptions({ ...options, kind }), [kind]);
  // Estado inicial vem do cache local para a cesta aparecer instantaneamente,
  // inclusive quando o backend do Render está acordando (cold start).
  const [items, setItems] = useState<QuoteCartItem[]>(() => readLocal<QuoteCartItem[]>(keys.cart, []));
  // As opções SEMPRE carregam o tipo do provedor (PDF, WhatsApp e servidor leem `kind` daqui).
  const [draftOptions, setDraftOptionsRaw] = useState<QuoteTextOptions>(() => ({ ...readLocal<QuoteTextOptions>(keys.options, {}), kind }));
  const setDraftOptionsState = useCallback((options: QuoteTextOptions) => setDraftOptionsRaw({ ...options, kind }), [kind]);
  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>(() => readLocal<SavedQuote[]>(keys.history, []));
  const [isOpen, setIsOpen] = useState(false);
  const [syncState, setSyncState] = useState<QuoteSyncState>('loading');
  // Contador, e não booleano: `setSyncState('offline')` com o estado já
  // 'offline' não re-renderiza, então uma segunda falha não acordaria o efeito
  // de reenvio. O número muda sempre, e é ele que anda a escada acima.
  const [syncFailures, setSyncFailures] = useState(0);

  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
  const totalPrice = items.reduce((acc, item) => acc + item.quantity * (item.unitPrice || 0), 0);

  // `hydrated` separa "ainda não sei o que o servidor tem" de "sei e é isto".
  // Sem essa guarda, o primeiro efeito de sincronização sobrescreveria a cesta
  // do servidor com o cache local antes de ler o servidor.
  const hydratedRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const pendingRef = useRef<{ items: QuoteCartItem[]; options: QuoteTextOptions } | null>(null);
  const inFlightRef = useRef(false);

  const refreshSavedQuotes = useCallback(async () => {
    try {
      const data = await apiJson<{ quotes: ApiQuote[] }>(`/api/quotes?take=${RECENT_QUOTES_PAGE_SIZE}&kind=${kind}`);
      const mapped = data.quotes.map(toSavedQuote);
      setSavedQuotes(mapped);
      writeLocal(keys.history, mapped);
    } catch {
      // Mantém a última lista conhecida (cache) em vez de esvaziar a tela.
    }
  }, [keys.history, kind]);

  const flushDraft = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      // Laço em vez de chamada recursiva: cada volta consome o último estado
      // pendente, então um clique durante a gravação não gera uma fila de
      // requisições — só marca que há mais uma versão para enviar.
      while (pendingRef.current) {
        const pending = pendingRef.current;
        pendingRef.current = null;
        setSyncState('saving');

        try {
          await apiJson<{ quote: ApiQuote }>('/api/quotes/draft', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: toApiItems(pending.items), options: apiOptions(pending.options) }),
            timeoutMs: 20_000,
          });
        } catch {
          // Não reverte a tela: a cesta local continua válida. O aviso na UI é
          // o que impede o atendente de confiar num orçamento que só existe
          // neste navegador.
          setSyncState('offline');
          // **Devolve o estado à fila.** Sem isto a cesta só voltava a ser
          // enviada na próxima edição — e quando a falha cai no último item
          // adicionado (o caso comum: põe a peça e vai gerar o PDF), ela
          // ficava fora do servidor indefinidamente. `flushBeforeUnload`
          // também só grava quando este ref tem algo, então fechar a aba
          // depois de uma falha perdia a versão do servidor junto.
          if (!pendingRef.current) pendingRef.current = pending;
          setSyncFailures(total => total + 1);
          return;
        }
      }
      // Só limpa a marca se nada novo entrou na fila durante a gravação.
      if (!pendingRef.current) { try { localStorage.removeItem(keys.unsynced); } catch { /* sem armazenamento */ } }
      setSyncState('synced');
      setSyncFailures(0);
    } finally {
      inFlightRef.current = false;
    }
  }, [apiOptions, keys.unsynced]);

  /**
   * Reenvia sozinho depois de uma falha, com espera crescente.
   *
   * A gravação é um `PUT` do estado INTEIRO, então reenviar é idempotente:
   * nunca duplica item, mesmo que a requisição anterior tenha chegado ao banco
   * e só a resposta tenha se perdido.
   *
   * A escada zera sozinha quando uma gravação passa (`setSyncFailures(0)` no
   * sucesso). **Não zera a cada edição de propósito**: isso exigiria chamar um
   * setter de dentro do updater de `setItems`, que roda na fase de render. Uma
   * edição durante a espera já é coberta pelo debounce, que manda o estado
   * inteiro de qualquer jeito.
   */
  useEffect(() => {
    if (syncFailures === 0 || syncFailures > DRAFT_RETRY_DELAYS_MS.length) return;
    const timer = window.setTimeout(() => {
      void flushDraft();
    }, DRAFT_RETRY_DELAYS_MS[syncFailures - 1]);
    return () => window.clearTimeout(timer);
  }, [syncFailures, flushDraft]);

  const queueDraftSync = useCallback((nextItems: QuoteCartItem[], nextOptions: QuoteTextOptions) => {
    if (!hydratedRef.current) return;
    pendingRef.current = { items: nextItems, options: nextOptions };
    try { localStorage.setItem(keys.unsynced, String(Date.now())); } catch { /* sem armazenamento */ }
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void flushDraft();
    }, DRAFT_SYNC_DEBOUNCE_MS);
  }, [flushDraft, keys.unsynced]);

  // Hidratação inicial: o servidor manda na cesta. O cache local só sobrevive
  // quando o servidor não responde.
  useEffect(() => {
    let active = true;

    // O provider envolve a tela de login também. Bater em /api/quotes/draft sem
    // sessão devolveria 401 e dispararia o evento de sessão expirada na própria
    // tela de login. O escopo anônimo é o sinal de "ainda não há quem cotar";
    // `syncState` já nasce 'loading', então basta não hidratar.
    if (quoteStorageScopeFromSession() === 'anonymous') {
      hydratedRef.current = false;
      return;
    }

    void (async () => {
      try {
        const data = await apiJson<{ quote: ApiQuote }>(`/api/quotes/draft?kind=${kind}`, { timeoutMs: 25_000 });
        if (!active) return;
        const serverItems = fromApiItems(data.quote.items);
        const serverOptions = fromApiOptions(data.quote);
        const localItems = readLocal<QuoteCartItem[]>(keys.cart, []);
        const unsyncedAt = Number(readLocal<string | number>(keys.unsynced, 0));
        const localIsNewer = unsyncedAt > 0 && Date.now() - unsyncedAt < UNSYNCED_MAX_AGE_MS;

        // Cesta local com itens e servidor vazio significa que o atendente
        // montou o orçamento enquanto a API estava fora. E, com a marca de
        // "edição não enviada", o local também vale mais que a versão antiga do
        // servidor (rede caiu ou sessão expirou no meio do atendimento). Nos dois
        // casos o local sobe para o servidor em vez de ser descartado.
        if ((!serverItems.length && localItems.length) || localIsNewer) {
          hydratedRef.current = true;
          setSyncState('saving');
          pendingRef.current = { items: localItems, options: readLocal<QuoteTextOptions>(keys.options, {}) };
          void flushDraft();
        } else {
          setItems(serverItems);
          setDraftOptionsState(serverOptions);
          writeLocal(keys.cart, serverItems);
          writeLocal(keys.options, serverOptions);
          hydratedRef.current = true;
          setSyncState('synced');
        }

        await refreshSavedQuotes();
      } catch {
        if (!active) return;
        // Segue operando com o cache local, avisando que não está no banco.
        hydratedRef.current = true;
        setSyncState('offline');
      }
    })();

    return () => {
      active = false;
    };
  }, [flushDraft, keys.cart, keys.options, keys.unsynced, kind, refreshSavedQuotes, setDraftOptionsState]);

  // Cache offline: gravado em toda mudança, para um F5 durante queda da API não
  // apagar o que o atendente acabou de montar.
  useEffect(() => {
    writeLocal(keys.cart, items);
  }, [items, keys.cart]);

  useEffect(() => {
    writeLocal(keys.options, draftOptions);
  }, [draftOptions, keys.options]);

  // Duas janelas do mesmo navegador são UMA cesta (achado da rodada 2, 2026-10-09). Cada aba mandava o estado inteiro ao servidor, então a que gravava por
  // último apagava o item que a outra acabara de lançar, sem aviso. O cache local (localStorage) é compartilhado: quando OUTRA aba o muda, esta adota o que
  // está lá e larga o que tinha para enviar (a aba que escreveu é quem grava no servidor). Compara com o valor ATUAL do armazenamento, e não com o do evento,
  // para as duas abas convergirem no mesmo estado em vez de ficarem trocando versões.
  const latestRef = useRef({ items, options: draftOptions });
  useEffect(() => { latestRef.current = { items, options: draftOptions }; });
  useEffect(() => {
    const dropPending = () => {
      pendingRef.current = null;
      if (syncTimerRef.current !== null) { window.clearTimeout(syncTimerRef.current); syncTimerRef.current = null; }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || (event.key !== keys.cart && event.key !== keys.options)) return;
      let raw: string | null;
      try { raw = window.localStorage.getItem(event.key); } catch { return; }
      if (raw === null) return;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (event.key === keys.cart) {
          if (!Array.isArray(parsed) || JSON.stringify(latestRef.current.items) === raw) return;
          dropPending();
          setItems(parsed as QuoteCartItem[]);
        } else {
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || JSON.stringify(latestRef.current.options) === raw) return;
          dropPending();
          setDraftOptionsState(parsed as QuoteTextOptions);
        }
      } catch {
        // Valor ilegível no armazenamento: esta aba segue com o que tem.
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [keys.cart, keys.options, setDraftOptionsState]);

  // Última chance de gravar antes de fechar a aba: sem isso, fechar o navegador
  // dentro da janela de debounce perderia os itens mais recentes no servidor.
  useEffect(() => {
    const flushBeforeUnload = () => {
      if (!pendingRef.current) return;
      const payload = JSON.stringify({
        items: toApiItems(pendingRef.current.items),
        options: apiOptions(pendingRef.current.options),
      });
      try {
        // `fetch` com keepalive sobrevive ao unload; `sendBeacon` não serve
        // porque a rota é PUT e exige Content-Type JSON.
        void fetch('/api/quotes/draft', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          credentials: 'include',
          keepalive: true,
        });
      } catch {
        // Navegador restrito: o cache local já tem o estado.
      }
    };

    window.addEventListener('pagehide', flushBeforeUnload);
    return () => {
      window.removeEventListener('pagehide', flushBeforeUnload);
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    };
  }, [apiOptions]);

  const applyItems = useCallback((updater: (current: QuoteCartItem[]) => QuoteCartItem[]) => {
    setItems(current => {
      const next = updater(current);
      queueDraftSync(next, draftOptions);
      return next;
    });
  }, [draftOptions, queueDraftSync]);

  const setDraftOptions = useCallback((options: QuoteTextOptions) => {
    setDraftOptionsState(options);
    queueDraftSync(items, options);
  }, [items, queueDraftSync, setDraftOptionsState]);

  const saveCurrentQuote = useCallback(async (options?: QuoteTextOptions): Promise<SavedQuote | null> => {
    if (!items.length) return null;
    const effectiveOptions = { ...draftOptions, ...(options || {}) };

    try {
      const data = await apiJson<{ quote: ApiQuote }>('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: toApiItems(items), options: apiOptions(effectiveOptions) }),
        timeoutMs: 25_000,
      });
      const saved = toSavedQuote(data.quote);
      setSavedQuotes(current => {
        const next = [saved, ...current].slice(0, RECENT_QUOTES_PAGE_SIZE);
        writeLocal(keys.history, next);
        return next;
      });
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível salvar o orçamento.';
      toast.error(message);
      return null;
    }
  }, [apiOptions, draftOptions, items, keys.history]);

  const restoreQuote = useCallback((savedQuote: SavedQuote) => {
    if (!savedQuote.items.length) return;
    const restoredOptions: QuoteTextOptions = {
      kind: savedQuote.kind ?? 'PARTS',
      docNumber: savedQuote.docNumber,
      customerName: savedQuote.customerName,
      customerPhone: savedQuote.customerPhone,
      paymentMethod: savedQuote.paymentMethod,
      leadTime: savedQuote.leadTime,
      notes: savedQuote.notes,
      machineModel: splitQuoteMachine(savedQuote.machineModel).machine || undefined,
      engine: splitQuoteMachine(savedQuote.machineModel).engine || undefined,
      discountPercentage: savedQuote.discountPercentage || 0,
    };
    setItems(savedQuote.items);
    setDraftOptionsState(restoredOptions);
    queueDraftSync(savedQuote.items, restoredOptions);
    setIsOpen(true);
    playCartSound();
    toast.success(`Orçamento com ${savedQuote.totalItems} peças restaurado na cesta!`);
  }, [queueDraftSync, setDraftOptionsState]);

  const deleteSavedQuote = useCallback(async (id: string) => {
    try {
      await apiJson<{ ok: boolean }>(`/api/quotes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setSavedQuotes(current => {
        const next = current.filter(quote => quote.id !== id);
        writeLocal(keys.history, next);
        return next;
      });
      toast.info('Orçamento removido do histórico.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover o orçamento.');
    }
  }, [keys.history]);

  const clearSavedQuotes = useCallback(async () => {
    // Não existe rota de exclusão em massa de propósito: apagar o histórico
    // comercial da loja inteira num clique é um estrago sem volta. A varredura
    // aqui só alcança o que o usuário pode excluir, e o backend valida cada um.
    const ids = savedQuotes.map(quote => quote.id);
    const results = await Promise.allSettled(
      ids.map(id => apiJson<{ ok: boolean }>(`/api/quotes/${encodeURIComponent(id)}`, { method: 'DELETE' })),
    );
    const failed = results.filter(result => result.status === 'rejected').length;
    await refreshSavedQuotes();
    if (failed) toast.error(`${failed} orçamento(s) não puderam ser removidos.`);
    else toast.info('Histórico de orçamentos esvaziado.');
  }, [refreshSavedQuotes, savedQuotes]);

  const addItem = useCallback((item: Omit<QuoteCartItem, 'quantity' | 'id'> & { quantity?: number }) => {
    const id = cartItemKey(item.partNumber, item.manufacturer, item.model, item.pnc);
    const qty = item.quantity || 1;

    applyItems(current => {
      const existingIndex = current.findIndex(i => i.id === id);
      if (existingIndex >= 0) {
        const updated = [...current];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + qty,
        };
        return updated;
      }
      return [...current, { ...item, id, quantity: qty }];
    });

    // Sem aviso por peça: o botão da linha passa a "No orçamento · N", o contador do cabeçalho e o
    // orçamento lateral sobem na hora, e o som já toca. O aviso repetia isso e ainda cobria a tela.
    playCartSound();
  }, [applyItems]);

  const addItems = useCallback((itemsToAdd: Array<Omit<QuoteCartItem, 'quantity' | 'id'> & { quantity?: number }>) => {
    if (!itemsToAdd.length) return;
    applyItems(current => {
      const updated = [...current];
      for (const item of itemsToAdd) {
        const id = cartItemKey(item.partNumber, item.manufacturer, item.model, item.pnc);
        const qty = item.quantity || 1;
        const existingIndex = updated.findIndex(i => i.id === id);
        if (existingIndex >= 0) {
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + qty,
          };
        } else {
          updated.push({ ...item, id, quantity: qty });
        }
      }
      return updated;
    });

    playCartSound();
    toast.success(`${itemsToAdd.length} itens adicionados ao orçamento!`, {
      action: {
        label: 'Ver Cesta',
        onClick: () => setIsOpen(true),
      },
    });
  }, [applyItems]);

  const removeItem = useCallback((id: string) => {
    let removed: QuoteCartItem | undefined;
    applyItems(current => {
      removed = current.find(item => item.id === id);
      return current.filter(item => item.id !== id);
    });
    if (removed) {
      const item = removed;
      toast.success(`Peça "${item.name}" removida do orçamento.`, {
        action: {
          label: 'Desfazer',
          onClick: () => applyItems(current => current.some(existing => existing.id === item.id) ? current : [...current, item]),
        },
      });
    }
  }, [applyItems]);

  const updateQuantity = useCallback((id: string, delta: number) => {
    applyItems(current =>
      current
        .map(item => {
          if (item.id === id) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is QuoteCartItem => Boolean(item)),
    );
  }, [applyItems]);

  const updateUnitPrice = useCallback((id: string, price: number | undefined) => {
    applyItems(current =>
      current.map(item => {
        if (item.id === id) {
          return { ...item, unitPrice: price !== undefined && price >= 0 ? price : undefined };
        }
        return item;
      }),
    );
  }, [applyItems]);

  const updateLeadTime = useCallback((id: string, leadTime: string | undefined) => {
    applyItems(current => current.map(item => (item.id === id ? { ...item, leadTime: leadTime?.trim() || undefined } : item)));
  }, [applyItems]);

  const clearCart = useCallback(() => {
    // O motor pertence ao atendimento que acabou: não pode vazar para o orçamento do próximo cliente.
    // O número da OS também é do atendimento que acabou.
    // No conserto, "novo orçamento" começa do zero (cliente, pagamento, desconto e OS são deste atendimento). Na gaveta de peças o cliente da conversa
    // continua (o balcão atende o mesmo cliente em várias buscas).
    const options: QuoteTextOptions = kind === 'REPAIR' ? {} : { ...draftOptions, engine: undefined, docNumber: undefined };
    setItems([]);
    setDraftOptionsState(options);
    queueDraftSync([], options);
  }, [draftOptions, kind, queueDraftSync, setDraftOptionsState]);

  const generateWhatsAppText = useCallback((optionsOrModel?: string | QuoteTextOptions) => {
    if (!items.length) return '';

    const opts: QuoteTextOptions = typeof optionsOrModel === 'string'
      ? { ...draftOptions, machineModel: optionsOrModel }
      : { ...draftOptions, ...(optionsOrModel || {}) };

    // O texto que o CLIENTE recebe mora em lib/quote-message.ts (puro e testado). Posição na vista,
    // seção do catálogo e PNC são do balcão e não vão na mensagem.
    return buildWhatsAppMessage({ items, options: opts });
  }, [draftOptions, items]);

  const openWhatsApp = useCallback((optionsOrModel?: string | QuoteTextOptions) => {
    const text = generateWhatsAppText(optionsOrModel);
    if (!text) return;

    const opts: QuoteTextOptions = typeof optionsOrModel === 'string'
      ? { ...draftOptions, machineModel: optionsOrModel }
      : { ...draftOptions, ...(optionsOrModel || {}) };

    void saveCurrentQuote(opts);

    const cleanPhone = (opts.customerPhone || '').replace(/\D/g, '');
    const fullPhone = cleanPhone
      ? (cleanPhone.length >= 10 && !cleanPhone.startsWith('55') ? `55${cleanPhone}` : cleanPhone)
      : '';

    const url = fullPhone
      ? `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

    window.open(url, '_blank', 'noopener,noreferrer');
  }, [draftOptions, generateWhatsAppText, saveCurrentQuote]);

  const createPdfQuote = useCallback(async (options?: QuoteTextOptions & QuotePdfExtras): Promise<JsPdf | null> => {
    if (!items.length) return null;
    const [jspdfModule, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const { quoteDate, reference, validityDays, company, quoteNumber, customerNotes, ...rest } = options ?? {};
    const opts: QuoteTextOptions = { ...draftOptions, ...rest };
    // O layout do PDF mora em lib/quote-pdf.ts (testado). Aqui só se junta o que a gaveta já tem.
    const [{ buildQuotePdf }, { loadStoreLogo }, { resolveAttendantName }] = await Promise.all([
      import('../lib/quote-pdf'),
      import('../lib/pdf-assets'),
      import('../lib/store-profile'),
    ]);
    // "ATT.": o nome cadastrado pelo administrador. Sem nome (e sem e-mail no formato nome.sobrenome), a linha some.
    return buildQuotePdf({
      doc: new jspdfModule.jsPDF('p', 'pt', 'a4'),
      autoTable: autoTableModule.default,
      items,
      options: { ...opts, attendantName: (await resolveAttendantName()) || undefined, ...(reference?.trim() ? { reference: reference.trim() } : {}), ...(validityDays ? { validityDays } : {}), ...(company?.trim() ? { company } : {}), ...((quoteNumber?.trim() || opts.docNumber?.trim()) ? { quoteNumber: quoteNumber?.trim() || opts.docNumber } : {}), ...(customerNotes?.trim() ? { customerNotes } : {}) },
      logo: await loadStoreLogo(),
      now: quoteDate,
    });
  }, [draftOptions, items]);

  const generatePdfQuote = useCallback(async (optionsOrModel?: string | QuoteTextOptions) => {
    if (!items.length) {
      toast.error('A cesta está vazia!');
      return;
    }

    const opts: QuoteTextOptions = typeof optionsOrModel === 'string'
      ? { ...draftOptions, machineModel: optionsOrModel }
      : { ...draftOptions, ...(optionsOrModel || {}) };

    void saveCurrentQuote(opts);

    let doc: JsPdf | null;
    try {
      doc = await createPdfQuote(opts);
    } catch (error) {
      console.error('Falha ao gerar o PDF:', error);
      toast.error('Não foi possível gerar o PDF. Tente novamente.');
      return;
    }
    if (!doc) return;
    doc.save(`Orcamento_Vardao_${Date.now()}.pdf`);
    toast.success('PDF gerado com sucesso!');
  }, [createPdfQuote, draftOptions, items.length, saveCurrentQuote]);

  const value = useMemo<QuoteCartContextType>(() => ({
    items,
    addItem,
    addItems,
    removeItem,
    updateQuantity,
    updateUnitPrice,
    updateLeadTime,
    clearCart,
    isOpen,
    setIsOpen,
    totalItems,
    totalPrice,
    generateWhatsAppText,
    openWhatsApp,
    generatePdfQuote,
    createPdfQuote,
    savedQuotes,
    saveCurrentQuote,
    restoreQuote,
    deleteSavedQuote,
    clearSavedQuotes,
    refreshSavedQuotes,
    syncState,
    draftOptions,
    setDraftOptions,
  }), [
    addItem, addItems, clearCart, clearSavedQuotes, deleteSavedQuote,
    createPdfQuote, draftOptions, generatePdfQuote, generateWhatsAppText, isOpen, items, openWhatsApp,
    refreshSavedQuotes, removeItem, restoreQuote, saveCurrentQuote, savedQuotes, setDraftOptions,
    syncState, totalItems, totalPrice, updateQuantity, updateUnitPrice, updateLeadTime,
  ]);

  return <QuoteCartContext.Provider value={value}>{children}</QuoteCartContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useQuoteCart() {
  const context = useContext(QuoteCartContext);
  if (!context) {
    throw new Error('useQuoteCart deve ser utilizado dentro de QuoteCartProvider');
  }
  return context;
}
