import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { apiJson, formatHusqvarnaPartNumber } from '../lib';
import { playCartSound } from '../lib/sound';
import { quoteStorageScopeFromSession } from '../lib/quote-storage-scope';
type JsPdfWithAutoTable = import('jspdf').jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

export interface QuoteCartItem {
  id: string; // unique key: `${partNumber}|${model}|${pnc || ''}`
  partNumber: string;
  effectiveCode?: string;
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
  quantity: number;
  unitPrice?: number;
}

export interface QuoteTextOptions {
  machineModel?: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: string;
  discountPercentage?: number;
}

export interface SavedQuote {
  id: string;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: string;
  machineModel?: string;
  discountPercentage?: number;
  items: QuoteCartItem[];
  totalPrice: number;
  totalItems: number;
  attendantEmail?: string | null;
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
  clearCart: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  totalItems: number;
  totalPrice: number;
  generateWhatsAppText: (optionsOrModel?: string | QuoteTextOptions) => string;
  copyQuoteToClipboard: (optionsOrModel?: string | QuoteTextOptions) => Promise<void>;
  openWhatsApp: (optionsOrModel?: string | QuoteTextOptions) => void;
  generatePdfQuote: (optionsOrModel?: string | QuoteTextOptions) => Promise<void>;
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
const STORAGE_KEY = 'cognivault_quote_cart';
const OPTIONS_STORAGE_KEY = 'cognivault_quote_draft_options';
const HISTORY_STORAGE_KEY = 'cognivault_quote_history';

const DRAFT_SYNC_DEBOUNCE_MS = 900;
const RECENT_QUOTES_PAGE_SIZE = 25;

interface ApiQuoteItem {
  id: string;
  partNumber: string;
  effectiveCode: string | null;
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
  quantity: number;
  unitPrice: number | null;
}

interface ApiQuote {
  id: string;
  status: 'DRAFT' | 'SAVED';
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string | null;
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
  items: ApiQuoteItem[];
}

function cartItemKey(partNumber: string, model: string | null | undefined, pnc: string | null | undefined): string {
  return `${partNumber}|${model || ''}|${pnc || ''}`;
}

function fromApiItems(items: ApiQuoteItem[]): QuoteCartItem[] {
  return items.map(item => ({
    id: cartItemKey(item.partNumber, item.model, item.pnc),
    partNumber: item.partNumber,
    effectiveCode: item.effectiveCode ?? undefined,
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
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? undefined,
  }));
}

function toApiItems(items: QuoteCartItem[]) {
  return items.map(item => ({
    partNumber: item.partNumber,
    effectiveCode: item.effectiveCode ?? null,
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
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? null,
  }));
}

function toApiOptions(options: QuoteTextOptions) {
  return {
    customerName: options.customerName?.trim() || null,
    customerPhone: options.customerPhone?.trim() || null,
    paymentMethod: options.paymentMethod || null,
    machineModel: options.machineModel?.trim() || null,
    discountPercentage: options.discountPercentage ?? 0,
  };
}

function fromApiOptions(quote: ApiQuote): QuoteTextOptions {
  return {
    customerName: quote.customerName ?? undefined,
    customerPhone: quote.customerPhone ?? undefined,
    paymentMethod: quote.paymentMethod ?? undefined,
    machineModel: quote.machineModel ?? undefined,
    discountPercentage: quote.discountPercentage || 0,
  };
}

function toSavedQuote(quote: ApiQuote): SavedQuote {
  return {
    id: quote.id,
    createdAt: quote.savedAt || quote.createdAt,
    customerName: quote.customerName ?? undefined,
    customerPhone: quote.customerPhone ?? undefined,
    paymentMethod: quote.paymentMethod ?? undefined,
    machineModel: quote.machineModel ?? undefined,
    discountPercentage: quote.discountPercentage || undefined,
    items: fromApiItems(quote.items),
    totalPrice: quote.grossTotal,
    totalItems: quote.totalItems,
    attendantEmail: quote.attendantEmail,
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

export function QuoteCartProvider({ children }: { children: ReactNode }) {
  // Estado inicial vem do cache local para a cesta aparecer instantaneamente,
  // inclusive quando o backend do Render está acordando (cold start).
  const [items, setItems] = useState<QuoteCartItem[]>(() => readLocal<QuoteCartItem[]>(STORAGE_KEY, []));
  const [draftOptions, setDraftOptionsState] = useState<QuoteTextOptions>(() =>
    readLocal<QuoteTextOptions>(OPTIONS_STORAGE_KEY, {}),
  );
  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>(() => readLocal<SavedQuote[]>(HISTORY_STORAGE_KEY, []));
  const [isOpen, setIsOpen] = useState(false);
  const [syncState, setSyncState] = useState<QuoteSyncState>('loading');

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
      const data = await apiJson<{ quotes: ApiQuote[] }>(`/api/quotes?take=${RECENT_QUOTES_PAGE_SIZE}`);
      const mapped = data.quotes.map(toSavedQuote);
      setSavedQuotes(mapped);
      writeLocal(HISTORY_STORAGE_KEY, mapped);
    } catch {
      // Mantém a última lista conhecida (cache) em vez de esvaziar a tela.
    }
  }, []);

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
            body: JSON.stringify({ items: toApiItems(pending.items), options: toApiOptions(pending.options) }),
            timeoutMs: 20_000,
          });
        } catch {
          // Não reverte a tela: a cesta local continua válida e o próximo flush
          // reenvia o estado inteiro. O aviso na UI é o que impede o atendente
          // de confiar num orçamento que só existe neste navegador.
          setSyncState('offline');
          return;
        }
      }
      setSyncState('synced');
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const queueDraftSync = useCallback((nextItems: QuoteCartItem[], nextOptions: QuoteTextOptions) => {
    if (!hydratedRef.current) return;
    pendingRef.current = { items: nextItems, options: nextOptions };
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void flushDraft();
    }, DRAFT_SYNC_DEBOUNCE_MS);
  }, [flushDraft]);

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
        const data = await apiJson<{ quote: ApiQuote }>('/api/quotes/draft', { timeoutMs: 25_000 });
        if (!active) return;
        const serverItems = fromApiItems(data.quote.items);
        const serverOptions = fromApiOptions(data.quote);
        const localItems = readLocal<QuoteCartItem[]>(STORAGE_KEY, []);

        // Cesta local com itens e servidor vazio significa que o atendente
        // montou o orçamento enquanto a API estava fora. Nesse caso o local
        // sobe para o servidor em vez de ser descartado.
        if (!serverItems.length && localItems.length) {
          hydratedRef.current = true;
          setSyncState('saving');
          pendingRef.current = { items: localItems, options: readLocal<QuoteTextOptions>(OPTIONS_STORAGE_KEY, {}) };
          void flushDraft();
        } else {
          setItems(serverItems);
          setDraftOptionsState(serverOptions);
          writeLocal(STORAGE_KEY, serverItems);
          writeLocal(OPTIONS_STORAGE_KEY, serverOptions);
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
  }, [flushDraft, refreshSavedQuotes]);

  // Cache offline: gravado em toda mudança, para um F5 durante queda da API não
  // apagar o que o atendente acabou de montar.
  useEffect(() => {
    writeLocal(STORAGE_KEY, items);
  }, [items]);

  useEffect(() => {
    writeLocal(OPTIONS_STORAGE_KEY, draftOptions);
  }, [draftOptions]);

  // Última chance de gravar antes de fechar a aba: sem isso, fechar o navegador
  // dentro da janela de debounce perderia os itens mais recentes no servidor.
  useEffect(() => {
    const flushBeforeUnload = () => {
      if (!pendingRef.current) return;
      const payload = JSON.stringify({
        items: toApiItems(pendingRef.current.items),
        options: toApiOptions(pendingRef.current.options),
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
  }, []);

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
  }, [items, queueDraftSync]);

  const saveCurrentQuote = useCallback(async (options?: QuoteTextOptions): Promise<SavedQuote | null> => {
    if (!items.length) return null;
    const effectiveOptions = { ...draftOptions, ...(options || {}) };

    try {
      const data = await apiJson<{ quote: ApiQuote }>('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: toApiItems(items), options: toApiOptions(effectiveOptions) }),
        timeoutMs: 25_000,
      });
      const saved = toSavedQuote(data.quote);
      setSavedQuotes(current => {
        const next = [saved, ...current].slice(0, RECENT_QUOTES_PAGE_SIZE);
        writeLocal(HISTORY_STORAGE_KEY, next);
        return next;
      });
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível salvar o orçamento.';
      toast.error(message);
      return null;
    }
  }, [draftOptions, items]);

  const restoreQuote = useCallback((savedQuote: SavedQuote) => {
    if (!savedQuote.items.length) return;
    const restoredOptions: QuoteTextOptions = {
      customerName: savedQuote.customerName,
      customerPhone: savedQuote.customerPhone,
      paymentMethod: savedQuote.paymentMethod,
      machineModel: savedQuote.machineModel,
      discountPercentage: savedQuote.discountPercentage || 0,
    };
    setItems(savedQuote.items);
    setDraftOptionsState(restoredOptions);
    queueDraftSync(savedQuote.items, restoredOptions);
    setIsOpen(true);
    playCartSound();
    toast.success(`Orçamento com ${savedQuote.totalItems} peças restaurado na cesta!`);
  }, [queueDraftSync]);

  const deleteSavedQuote = useCallback(async (id: string) => {
    try {
      await apiJson<{ ok: boolean }>(`/api/quotes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setSavedQuotes(current => {
        const next = current.filter(quote => quote.id !== id);
        writeLocal(HISTORY_STORAGE_KEY, next);
        return next;
      });
      toast.info('Orçamento removido do histórico.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover o orçamento.');
    }
  }, []);

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
    const id = cartItemKey(item.partNumber, item.model, item.pnc);
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

    playCartSound();

    toast.success(`Peça "${item.name}" adicionada ao orçamento.`, {
      action: {
        label: 'Ver Cesta',
        onClick: () => setIsOpen(true),
      },
    });
  }, [applyItems]);

  const addItems = useCallback((itemsToAdd: Array<Omit<QuoteCartItem, 'quantity' | 'id'> & { quantity?: number }>) => {
    if (!itemsToAdd.length) return;
    applyItems(current => {
      const updated = [...current];
      for (const item of itemsToAdd) {
        const id = cartItemKey(item.partNumber, item.model, item.pnc);
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
    applyItems(current => current.filter(item => item.id !== id));
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

  const clearCart = useCallback(() => {
    applyItems(() => []);
  }, [applyItems]);

  const generateWhatsAppText = useCallback((optionsOrModel?: string | QuoteTextOptions) => {
    if (!items.length) return '';

    const opts: QuoteTextOptions = typeof optionsOrModel === 'string'
      ? { ...draftOptions, machineModel: optionsOrModel }
      : { ...draftOptions, ...(optionsOrModel || {}) };

    const now = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    const modelsFound = [...new Set(items.map(i => i.model).filter(Boolean))];
    const headerModel = opts.machineModel || (modelsFound.length === 1 ? modelsFound[0] : modelsFound.join(' / '));
    const hasAnyPrice = items.some(i => (i.unitPrice || 0) > 0);

    let text = `🛠️ *ORÇAMENTO DE PEÇAS — VARDÃO MÁQUINAS*\n`;
    text += `📅 Data: ${now}\n`;
    if (opts.customerName) {
      text += `👤 Cliente: *${opts.customerName}*\n`;
    }
    if (headerModel) {
      text += `⚙️ Aplicação / Modelo: *Husqvarna ${headerModel}*\n`;
    }
    text += `\n📋 *Itens Selecionados:*\n`;

    items.forEach((item, index) => {
      const formattedCode = formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber);
      text += `\n${index + 1}. *${item.name}* (Qtd: ${item.quantity}x)\n`;
      text += `   • Código: \`${formattedCode}\`\n`;
      if (item.unitPrice && item.unitPrice > 0) {
        const itemTotal = item.quantity * item.unitPrice;
        text += `   • Preço: R$ ${item.unitPrice.toFixed(2).replace('.', ',')} un. (Subtotal: R$ ${itemTotal.toFixed(2).replace('.', ',')})\n`;
      }
      if (item.isSuperseded && item.originalCode) {
        text += `   • Substituição oficial de: \`${formatHusqvarnaPartNumber(item.originalCode)}\`\n`;
      }
      if (item.position) {
        text += `   • Vista/Posição: Pos. ${item.position}${item.section ? ` · ${item.section}` : ''}\n`;
      }
      if (item.model && modelsFound.length > 1) {
        text += `   • Máquina: ${item.model}${item.pnc ? ` (PNC ${item.pnc})` : ''}\n`;
      }
    });

    if (hasAnyPrice && totalPrice > 0) {
      if (opts.discountPercentage && opts.discountPercentage > 0) {
        const discountAmount = (totalPrice * opts.discountPercentage) / 100;
        const netTotal = totalPrice - discountAmount;
        text += `\nSubtotal: R$ ${totalPrice.toFixed(2).replace('.', ',')}\n`;
        text += `🎁 Desconto Comercial (${opts.discountPercentage}%): -R$ ${discountAmount.toFixed(2).replace('.', ',')}\n`;
        text += `💰 *VALOR FINAL COM DESCONTO: R$ ${netTotal.toFixed(2).replace('.', ',')}*\n`;
      } else {
        text += `\n💰 *VALOR TOTAL ESTIMADO: R$ ${totalPrice.toFixed(2).replace('.', ',')}*\n`;
      }
    }

    if (opts.paymentMethod && opts.paymentMethod !== 'A Combinar no Balcão') {
      text += `💳 Condição: *${opts.paymentMethod}*\n`;
    }

    text += `⏱️ Validade da Proposta: 7 dias úteis\n`;
    text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    text += `✅ *Peças 100% Originais Husqvarna*\n`;
    text += `🏬 *Vardão Máquinas* · Assistência Técnica Autorizada`;

    return text;
  }, [draftOptions, items, totalPrice]);

  const copyQuoteToClipboard = useCallback(async (optionsOrModel?: string | QuoteTextOptions) => {
    const text = generateWhatsAppText(optionsOrModel);
    if (!text) {
      toast.error('A cesta de orçamento está vazia.');
      return;
    }

    const saving = saveCurrentQuote(typeof optionsOrModel === 'object' ? optionsOrModel : undefined);

    try {
      // A escrita no clipboard precisa acontecer no mesmo gesto do usuário; por
      // isso vem antes do await do arquivamento.
      await navigator.clipboard.writeText(text);
      toast.success('Orçamento copiado para o WhatsApp com sucesso!');
    } catch {
      toast.error('Não foi possível copiar automaticamente.');
    }

    await saving;
  }, [generateWhatsAppText, saveCurrentQuote]);

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

  const generatePdfQuote = useCallback(async (optionsOrModel?: string | QuoteTextOptions) => {
    if (!items.length) {
      toast.error('A cesta está vazia!');
      return;
    }

    let jsPDF: typeof import('jspdf').jsPDF;
    let autoTable: typeof import('jspdf-autotable').default;
    try {
      const [jspdfModule, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      jsPDF = jspdfModule.jsPDF;
      autoTable = autoTableModule.default;
    } catch (error) {
      console.error('Falha ao carregar gerador de PDF:', error);
      toast.error('Não foi possível carregar o gerador de PDF. Tente novamente.');
      return;
    }

    const opts: QuoteTextOptions = typeof optionsOrModel === 'string'
      ? { ...draftOptions, machineModel: optionsOrModel }
      : { ...draftOptions, ...(optionsOrModel || {}) };

    void saveCurrentQuote(opts);

    const doc = new jsPDF('p', 'pt', 'a4');
    const now = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());

    // Header — azul-marinho #273a60 da identidade Vardão.
    doc.setFillColor(39, 58, 96);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 80, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('ORÇAMENTO DE PEÇAS', 40, 40);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Vardão Máquinas - Assistência Técnica Autorizada Husqvarna', 40, 60);

    // Info Section
    doc.setTextColor(30, 30, 29);
    let yPos = 110;

    doc.setFontSize(10);
    doc.text(`Data: ${now}`, 40, yPos);

    if (opts.customerName) {
      yPos += 15;
      doc.setFont('helvetica', 'bold');
      doc.text('Cliente: ', 40, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(opts.customerName, 85, yPos);
    }
    if (opts.customerPhone) {
      doc.setFont('helvetica', 'bold');
      doc.text('Telefone: ', 300, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(opts.customerPhone, 355, yPos);
    }

    const modelsFound = [...new Set(items.map(i => i.model).filter(Boolean))];
    const headerModel = opts.machineModel || (modelsFound.length === 1 ? modelsFound[0] : modelsFound.join(' / '));
    if (headerModel) {
      yPos += 15;
      doc.setFont('helvetica', 'bold');
      doc.text('Aplicação / Máquina: ', 40, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(`Husqvarna ${headerModel}`, 155, yPos);
    }

    yPos += 20;

    // Table
    const tableData = items.map((item, index) => {
      const code = formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber);
      let desc = item.name;
      if (item.isSuperseded && item.originalCode) {
         desc += `\n(Substitui: ${formatHusqvarnaPartNumber(item.originalCode)})`;
      }

      const unit = item.unitPrice ? `R$ ${item.unitPrice.toFixed(2).replace('.', ',')}` : '-';
      const total = item.unitPrice ? `R$ ${(item.quantity * item.unitPrice).toFixed(2).replace('.', ',')}` : '-';

      return [
        (index + 1).toString(),
        code,
        desc,
        item.quantity.toString(),
        unit,
        total
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [['#', 'CÓDIGO', 'DESCRIÇÃO', 'QTD', 'V. UNIT', 'SUBTOTAL']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [39, 58, 96] },
      styles: { fontSize: 9, cellPadding: 5 },
      columnStyles: {
        0: { cellWidth: 30, halign: 'center' },
        1: { cellWidth: 80, fontStyle: 'bold' },
        3: { cellWidth: 40, halign: 'center' },
        4: { cellWidth: 70, halign: 'right' },
        5: { cellWidth: 80, halign: 'right' }
      }
    });

    // Totals
    const finalY = ((doc as JsPdfWithAutoTable).lastAutoTable?.finalY ?? yPos) + 20;
    const hasAnyPrice = items.some(i => (i.unitPrice || 0) > 0);

    if (hasAnyPrice && totalPrice > 0) {
      doc.setFontSize(12);

      if (opts.discountPercentage && opts.discountPercentage > 0) {
        const discountAmount = (totalPrice * opts.discountPercentage) / 100;
        const netTotal = totalPrice - discountAmount;

        doc.setFont('helvetica', 'normal');
        doc.text(`Subtotal: R$ ${totalPrice.toFixed(2).replace('.', ',')}`, 350, finalY);
        doc.text(`Desconto (${opts.discountPercentage}%): -R$ ${discountAmount.toFixed(2).replace('.', ',')}`, 350, finalY + 15);

        doc.setFont('helvetica', 'bold');
        doc.text(`TOTAL FINAL: R$ ${netTotal.toFixed(2).replace('.', ',')}`, 350, finalY + 35);
      } else {
        doc.setFont('helvetica', 'bold');
        doc.text(`TOTAL FINAL: R$ ${totalPrice.toFixed(2).replace('.', ',')}`, 350, finalY);
      }
    }

    let footerY = finalY + (hasAnyPrice ? 60 : 20);
    if (opts.paymentMethod && opts.paymentMethod !== 'A Combinar no Balcão') {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Condição de Pagamento:', 40, footerY);
      doc.setFont('helvetica', 'normal');
      doc.text(opts.paymentMethod, 180, footerY);
      footerY += 15;
    }

    doc.setFontSize(9);
    doc.setTextColor(104, 104, 103);
    doc.text('Validade da proposta: 7 dias úteis.', 40, footerY);
    doc.text('Peças 100% Originais Husqvarna.', 40, footerY + 12);

    doc.save(`Orcamento_Vardao_${Date.now()}.pdf`);
    toast.success('PDF gerado com sucesso!');
  }, [draftOptions, items, saveCurrentQuote, totalPrice]);

  const value = useMemo<QuoteCartContextType>(() => ({
    items,
    addItem,
    addItems,
    removeItem,
    updateQuantity,
    updateUnitPrice,
    clearCart,
    isOpen,
    setIsOpen,
    totalItems,
    totalPrice,
    generateWhatsAppText,
    copyQuoteToClipboard,
    openWhatsApp,
    generatePdfQuote,
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
    addItem, addItems, clearCart, clearSavedQuotes, copyQuoteToClipboard, deleteSavedQuote,
    draftOptions, generatePdfQuote, generateWhatsAppText, isOpen, items, openWhatsApp,
    refreshSavedQuotes, removeItem, restoreQuote, saveCurrentQuote, savedQuotes, setDraftOptions,
    syncState, totalItems, totalPrice, updateQuantity, updateUnitPrice,
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
