import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { formatHusqvarnaPartNumber } from '../lib';

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
}

interface QuoteCartContextType {
  items: QuoteCartItem[];
  addItem: (item: Omit<QuoteCartItem, 'quantity' | 'id'> & { quantity?: number }) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  clearCart: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  totalItems: number;
  generateWhatsAppText: (machineModel?: string) => string;
  copyQuoteToClipboard: (machineModel?: string) => Promise<void>;
  openWhatsApp: (machineModel?: string) => void;
}

const QuoteCartContext = createContext<QuoteCartContextType | null>(null);

const STORAGE_KEY = 'cognivault_quote_cart';

export function QuoteCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<QuoteCartItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignora falha de cota de armazenamento local
    }
  }, [items]);

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

  const clearCart = () => {
    setItems([]);
  };

  const totalItems = useMemo(() => {
    return items.reduce((acc, item) => acc + item.quantity, 0);
  }, [items]);

  const generateWhatsAppText = (machineModel?: string) => {
    if (!items.length) return '';

    const now = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    const modelsFound = [...new Set(items.map(i => i.model).filter(Boolean))];
    const headerModel = machineModel || (modelsFound.length === 1 ? modelsFound[0] : modelsFound.join(' / '));

    let text = `🛠️ *ORÇAMENTO DE PEÇAS — VARDÃO MÁQUINAS*\n`;
    text += `📅 Data: ${now}\n`;
    if (headerModel) {
      text += `⚙️ Aplicação / Modelo: *Husqvarna ${headerModel}*\n`;
    }
    text += `\n📋 *Itens Selecionados:*\n`;

    items.forEach((item, index) => {
      const formattedCode = formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber);
      text += `\n${index + 1}. *${item.name}* (Qtd: ${item.quantity}x)\n`;
      text += `   • Código: \`${formattedCode}\`\n`;
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

    text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    text += `✅ *Peças 100% Originais Husqvarna*\n`;
    text += `🏬 *Vardão Máquinas* · Assistência Técnica Autorizada`;

    return text;
  };

  const copyQuoteToClipboard = async (machineModel?: string) => {
    const text = generateWhatsAppText(machineModel);
    if (!text) {
      toast.error('A cesta de orçamento está vazia.');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success('Orçamento copiado para o WhatsApp com sucesso!');
    } catch {
      toast.error('Não foi possível copiar automaticamente.');
    }
  };

  const openWhatsApp = (machineModel?: string) => {
    const text = generateWhatsAppText(machineModel);
    if (!text) return;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <QuoteCartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        isOpen,
        setIsOpen,
        totalItems,
        generateWhatsAppText,
        copyQuoteToClipboard,
        openWhatsApp,
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
