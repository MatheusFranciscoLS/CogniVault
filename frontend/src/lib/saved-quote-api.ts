import type { SavedQuote } from '../context/QuoteCartContext';

// O orçamento arquivado como o servidor devolve na lista (`GET /api/quotes`) e a conversão para o que a cesta sabe retomar.
// Mora aqui (e não no painel) porque a aba Conserto também abre orçamentos da pasta.

export interface ApiQuoteListItem {
  id: string;
  kind?: string;
  docNumber?: string | null;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string | null;
  leadTime: string | null;
  notes: string | null;
  machineModel: string | null;
  discountPercentage: number;
  totalItems: number;
  grossTotal: number;
  netTotal: number;
  createdAt: string;
  savedAt: string | null;
  attendantEmail: string | null;
  attendantName?: string | null;
  items: Array<{
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
  }>;
}

export function toSavedQuote(quote: ApiQuoteListItem): SavedQuote {
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
    totalPrice: quote.grossTotal,
    totalItems: quote.totalItems,
    attendantEmail: quote.attendantEmail,
    attendantName: quote.attendantName,
    items: quote.items.map(item => ({
      id: `${item.partNumber}|${item.manufacturer || ''}|${item.model || ''}|${item.pnc || ''}`,
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
    })),
  };
}
