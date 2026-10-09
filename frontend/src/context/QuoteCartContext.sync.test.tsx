import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib', async () => {
  const actual = await vi.importActual<typeof import('../lib')>('../lib');
  return { ...actual, apiJson: vi.fn() };
});
vi.mock('../lib/sound', () => ({ playCartSound: vi.fn() }));

import { apiJson } from '../lib';
import { QuoteCartProvider, useQuoteCart } from './QuoteCartContext';

// Rodada 2 de auditoria (2026-10-09): o que o balcão digitou e o servidor ainda não recebeu, e duas abas do mesmo navegador.

const apiJsonMock = vi.mocked(apiJson);

const emptyDraft = {
  quote: {
    id: 'q1', status: 'DRAFT', customerName: null, customerPhone: null, paymentMethod: null,
    machineModel: null, notes: null, discountPercentage: 0, totalItems: 0, grossTotal: 0,
    discountAmount: 0, netTotal: 0, createdAt: '', updatedAt: '', savedAt: null,
    attendantId: null, attendantEmail: null, items: [],
  },
};

type PutBody = { items: Array<{ partNumber: string; quantity: number }> };

const serverWith = (names: string[]) => ({
  quote: { ...emptyDraft.quote, totalItems: names.length, items: names.map((name, index) => ({ id: `s${index}`, sortOrder: index, partNumber: `P${index}`, name, model: null, quantity: 1, unitPrice: 10, isService: false, leadTime: null })) },
});

/** O servidor tem `names`; cada PUT segue `putOk(tentativa)`. */
function arrangeServer(names: string[], putOk: (attempt: number) => boolean = () => true) {
  const puts: PutBody[] = [];
  apiJsonMock.mockImplementation(async (url: string, options?: { method?: string; body?: BodyInit | null }) => {
    if (options?.method === 'PUT') {
      puts.push(JSON.parse(String(options.body)) as PutBody);
      if (!putOk(puts.length)) throw new Error('rede fora');
      return emptyDraft;
    }
    if (url.startsWith('/api/quotes?')) return { quotes: [] };
    return serverWith(names);
  });
  return puts;
}

const wrapper = ({ children }: { children: ReactNode }) => <QuoteCartProvider>{children}</QuoteCartProvider>;
const carburador = { partNumber: '587106701', name: 'CARBURADOR', model: '143RII' };
const localCart = [
  { id: 'a|||', partNumber: 'A', name: 'DA REDE CAIDA', model: '', quantity: 1, unitPrice: 5 },
  { id: 'b|||', partNumber: 'B', name: 'DO SERVIDOR', model: '', quantity: 1, unitPrice: 10 },
];

async function mount() {
  const view = renderHook(() => useQuoteCart(), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return view;
}
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem('cognivault_email', 'balcao@loja.test');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('cesta: o que o balcão digitou e o servidor ainda não recebeu', () => {
  it('com edição não enviada, a cesta local sobe em vez de ser trocada pela versão velha do servidor', async () => {
    localStorage.setItem('cognivault_quote_cart', JSON.stringify(localCart));
    localStorage.setItem('cognivault_quote_unsynced', String(Date.now() - 60_000));
    const puts = arrangeServer(['DO SERVIDOR']);
    const view = await mount();
    expect(puts).toHaveLength(1);
    expect(puts[0].items.map(item => item.partNumber)).toEqual(['A', 'B']);
    expect(view.result.current.items.map(item => item.partNumber)).toEqual(['A', 'B']);
    expect(localStorage.getItem('cognivault_quote_unsynced')).toBeNull();
  });

  it('sem a marca, o servidor continua mandando (outro aparelho pode ter mexido)', async () => {
    localStorage.setItem('cognivault_quote_cart', JSON.stringify(localCart));
    const puts = arrangeServer(['DO SERVIDOR']);
    const view = await mount();
    expect(puts).toHaveLength(0);
    expect(view.result.current.items.map(item => item.name)).toEqual(['DO SERVIDOR']);
  });

  it('marca muito velha (mais de 48 h) não vale mais que o servidor', async () => {
    localStorage.setItem('cognivault_quote_cart', JSON.stringify(localCart));
    localStorage.setItem('cognivault_quote_unsynced', String(Date.now() - 49 * 3600 * 1000));
    const puts = arrangeServer(['DO SERVIDOR']);
    const view = await mount();
    expect(puts).toHaveLength(0);
    expect(view.result.current.items).toHaveLength(1);
  });

  it('editar deixa a marca até o servidor confirmar; falhar a mantém', async () => {
    const puts = arrangeServer([], attempt => attempt > 1);
    const { result } = await mount();
    act(() => result.current.addItem(carburador));
    expect(Number(localStorage.getItem('cognivault_quote_unsynced'))).toBeGreaterThan(0);
    await advance(900);
    expect(puts).toHaveLength(1);
    expect(localStorage.getItem('cognivault_quote_unsynced')).not.toBeNull();
    await advance(2_000);
    expect(puts).toHaveLength(2);
    expect(localStorage.getItem('cognivault_quote_unsynced')).toBeNull();
  });

  it('a cesta de conserto tem a SUA marca: edição não enviada do conserto não mexe na de peças', async () => {
    localStorage.setItem('cognivault_repair_cart', JSON.stringify(localCart));
    localStorage.setItem('cognivault_repair_unsynced', String(Date.now() - 1_000));
    const puts = arrangeServer(['DO SERVIDOR']);
    const view = renderHook(() => useQuoteCart(), { wrapper: ({ children }: { children: ReactNode }) => <QuoteCartProvider kind="REPAIR">{children}</QuoteCartProvider> });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(puts).toHaveLength(1);
    expect(view.result.current.items.map(item => item.partNumber)).toEqual(['A', 'B']);
    expect(localStorage.getItem('cognivault_repair_unsynced')).toBeNull();
  });
});

describe('cesta: duas abas do mesmo navegador são uma cesta só', () => {
  const otherTabWrites = (key: string, value: unknown) => {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(value), storageArea: localStorage }));
  };

  it('o item que a outra aba lançou aparece aqui, e o que esta aba tinha na fila de envio é descartado', async () => {
    const puts = arrangeServer([]);
    const { result } = await mount();
    act(() => result.current.addItem(carburador)); // a fila de envio ainda não disparou (debounce)
    act(() => otherTabWrites('cognivault_quote_cart', [{ id: 'x|||', partNumber: 'X', name: 'DA OUTRA ABA', model: '', quantity: 1 }]));
    expect(result.current.items.map(item => item.partNumber)).toEqual(['X']);
    await advance(2_000);
    expect(puts).toHaveLength(0); // quem grava no servidor é a aba que escreveu
  });

  it('o mesmo valor que esta aba já tem não faz nada (sem vaivém entre as abas)', async () => {
    arrangeServer([]);
    const { result } = await mount();
    act(() => result.current.addItem(carburador));
    const before = result.current.items;
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'cognivault_quote_cart', storageArea: localStorage })); });
    expect(result.current.items).toBe(before);
  });

  it('valor ilegível, lista que não é lista e chave de OUTRO tipo de orçamento são ignorados', async () => {
    arrangeServer([]);
    const { result } = await mount();
    act(() => result.current.addItem(carburador));
    const before = result.current.items;
    act(() => { localStorage.setItem('cognivault_quote_cart', '{quebrado'); window.dispatchEvent(new StorageEvent('storage', { key: 'cognivault_quote_cart', storageArea: localStorage })); });
    act(() => otherTabWrites('cognivault_quote_cart', { nao: 'lista' }));
    act(() => otherTabWrites('cognivault_repair_cart', [{ id: 'r|||', partNumber: 'R', name: 'CONSERTO', model: '', quantity: 1 }]));
    expect(result.current.items).toBe(before);
  });

  it('as opções (cliente, pagamento) também acompanham a outra aba', async () => {
    arrangeServer([]);
    const { result } = await mount();
    act(() => otherTabWrites('cognivault_quote_draft_options', { customerName: 'Cliente da outra aba', kind: 'PARTS' }));
    expect(result.current.draftOptions.customerName).toBe('Cliente da outra aba');
  });
});
