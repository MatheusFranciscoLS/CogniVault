import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { formatHusqvarnaPartNumber } from '../lib';
import { playCartSound } from '../lib/sound';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  discountPercentage?: number;
  items: QuoteCartItem[];
  totalPrice: number;
  totalItems: number;
}

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
  generatePdfQuote: (optionsOrModel?: string | QuoteTextOptions) => void;
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
      discountPercentage: options?.discountPercentage || undefined,
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

  const addItems = (itemsToAdd: Array<Omit<QuoteCartItem, 'quantity' | 'id'> & { quantity?: number }>) => {
    if (!itemsToAdd.length) return;
    setItems(current => {
      const updated = [...current];
      for (const item of itemsToAdd) {
        const id = `${item.partNumber}|${item.model}|${item.pnc || ''}`;
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

  const generatePdfQuote = (optionsOrModel?: string | QuoteTextOptions) => {
    if (!items.length) {
      toast.error('A cesta está vazia!');
      return;
    }

    const opts: QuoteTextOptions = typeof optionsOrModel === 'string'
      ? { machineModel: optionsOrModel }
      : (optionsOrModel || {});

    saveCurrentQuote(opts);

    const doc = new jsPDF('p', 'pt', 'a4');
    const now = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    
    // Header
    doc.setFillColor(11, 29, 58); // #0b1d3a
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 80, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('ORÇAMENTO DE PEÇAS', 40, 40);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Vardão Máquinas - Assistência Técnica Autorizada Husqvarna', 40, 60);

    // Info Section
    doc.setTextColor(40, 40, 40);
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
      headStyles: { fillColor: [29, 79, 145] }, // #1d4f91
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
    const finalY = (doc as any).lastAutoTable.finalY + 20;
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
    doc.setTextColor(100, 100, 100);
    doc.text('Validade da proposta: 7 dias úteis.', 40, footerY);
    doc.text('Peças 100% Originais Husqvarna.', 40, footerY + 12);

    doc.save(`Orcamento_Vardao_${Date.now()}.pdf`);
    toast.success('PDF gerado com sucesso!');
  };

  return (
    <QuoteCartContext.Provider
      value={{
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
