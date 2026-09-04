import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { formatHusqvarnaPartNumber } from '../lib';
import { playCartSound } from '../lib/sound';

export interface QuoteCartItem {
  id: string; // unique key: `${partNumber}|${model}|${pnc || ''}`
  partNumber: string;
  effectiveCode?: string;
  name: string;
  model: string;
  pnc?: string | null;
  section?: string | null;
  position?: string | null;
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
}

export interface SavedQuote {
  id: string;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: string;
  items: QuoteCartItem[];
  totalPrice: number;
  totalItems: number;
}

interface QuoteCartContextType {
  items: QuoteCartItem[];
  addItem: (item: Omit<QuoteCartItem, 'quantity' | 'id'> & { quantity?: number }) => void;
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
  savedQuotes: SavedQuote[];
  saveCurrentQuote: (options?: QuoteTextOptions) => SavedQuote | null;
  restoreQuote: (savedQuote: SavedQuote) => void;
  deleteSavedQuote: (id: string) => void;
  clearSavedQuotes: () => void;
}

const QuoteCartContext = createContext<QuoteCartContextType | null>(null);

const STORAGE_KEY = 'cognivault_quote_cart';
const HISTORY_STORAGE_KEY = 'cognivault_quote_history';

function generateQuoteId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function QuoteCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<QuoteCartItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isOpen, setIsOpen] = useState(false);

  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
  const totalPrice = items.reduce((acc, item) => acc + item.quantity * (item.unitPrice || 0), 0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignora falha de cota de armazenamento local
    }
  }, [items]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(savedQuotes));
    } catch {
      // Ignora falha de cota de armazenamento local
    }
  }, [savedQuotes]);

  const saveCurrentQuote = (options?: QuoteTextOptions): SavedQuote | null => {
    if (!items.length) return null;

    const newQuote: SavedQuote = {
      id: generateQuoteId(),
      createdAt: new Date().toISOString(),
      customerName: options?.customerName?.trim() || undefined,
      customerPhone: options?.customerPhone?.trim() || undefined,
      paymentMethod: options?.paymentMethod || undefined,
      items: [...items],
      totalPrice,
      totalItems,
    };

    setSavedQuotes(prev => {
      // Previne duplicações consecutivas idênticas se salvou há menos de 10 segundos
      const filtered = prev.filter(q => {
        const timeDiff = Date.now() - new Date(q.createdAt).getTime();
        return !(timeDiff < 10000 && q.customerName === newQuote.customerName && q.totalItems === newQuote.totalItems && q.totalPrice === newQuote.totalPrice);
      });
      // Mantém no máximo 25 orçamentos recentes
      return [newQuote, ...filtered].slice(0, 25);
    });

    return newQuote;
  };

  const restoreQuote = (savedQuote: SavedQuote) => {
    if (!savedQuote.items.length) return;
    setItems(savedQuote.items);
    setIsOpen(true);
    playCartSound();
    toast.success(`Orçamento com ${savedQuote.totalItems} peças restaurado na cesta!`);
  };

  const deleteSavedQuote = (id: string) => {
    setSavedQuotes(prev => prev.filter(q => q.id !== id));
    toast.info('Orçamento removido do histórico.');
  };

  const clearSavedQuotes = () => {
    setSavedQuotes([]);
    toast.info('Histórico de orçamentos esvaziado.');
  };

  const addItem = (item: Omit<QuoteCartItem, 'quantity' | 'id'> & { quantity?: number }) => {
    const id = `${item.partNumber}|${item.model}|${item.pnc || ''}`;
    const qty = item.quantity || 1;

    setItems(current => {
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
  };

  const removeItem = (id: string) => {
    setItems(current => current.filter(item => item.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setItems(current =>
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
  };

  const updateUnitPrice = (id: string, price: number | undefined) => {
    setItems(current =>
      current.map(item => {
        if (item.id === id) {
          return { ...item, unitPrice: price !== undefined && price >= 0 ? price : undefined };
        }
        return item;
      }),
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const generateWhatsAppText = (optionsOrModel?: string | QuoteTextOptions) => {
    if (!items.length) return '';

    const opts: QuoteTextOptions = typeof optionsOrModel === 'string'
      ? { machineModel: optionsOrModel }
      : (optionsOrModel || {});

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
      text += `\n💰 *VALOR TOTAL ESTIMADO: R$ ${totalPrice.toFixed(2).replace('.', ',')}*\n`;
    }

    if (opts.paymentMethod && opts.paymentMethod !== 'A Combinar no Balcão') {
      text += `💳 Condição: *${opts.paymentMethod}*\n`;
    }

    text += `⏱️ Validade da Proposta: 7 dias úteis\n`;
    text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    text += `✅ *Peças 100% Originais Husqvarna*\n`;
    text += `🏬 *Vardão Máquinas* · Assistência Técnica Autorizada`;

    return text;
  };

  const copyQuoteToClipboard = async (optionsOrModel?: string | QuoteTextOptions) => {
    const text = generateWhatsAppText(optionsOrModel);
    if (!text) {
      toast.error('A cesta de orçamento está vazia.');
      return;
    }

    if (typeof optionsOrModel === 'object') {
      saveCurrentQuote(optionsOrModel);
    } else {
      saveCurrentQuote();
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success('Orçamento copiado para o WhatsApp com sucesso!');
    } catch {
      toast.error('Não foi possível copiar automaticamente.');
    }
  };

  const openWhatsApp = (optionsOrModel?: string | QuoteTextOptions) => {
    const text = generateWhatsAppText(optionsOrModel);
    if (!text) return;

    const opts: QuoteTextOptions = typeof optionsOrModel === 'string'
      ? { machineModel: optionsOrModel }
      : (optionsOrModel || {});

    saveCurrentQuote(opts);

    const cleanPhone = (opts.customerPhone || '').replace(/\D/g, '');
    const fullPhone = cleanPhone
      ? (cleanPhone.length >= 10 && !cleanPhone.startsWith('55') ? `55${cleanPhone}` : cleanPhone)
      : '';

    const url = fullPhone
      ? `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <QuoteCartContext.Provider
      value={{
        items,
        addItem,
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
        savedQuotes,
        saveCurrentQuote,
        restoreQuote,
        deleteSavedQuote,
        clearSavedQuotes,
      }}
    >
      {children}
    </QuoteCartContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useQuoteCart() {
  const context = useContext(QuoteCartContext);
  if (!context) {
    throw new Error('useQuoteCart deve ser utilizado dentro de QuoteCartProvider');
  }
  return context;
}
