import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A cesta fala com a API por `apiJson`. Trocar só ele deixa o resto do módulo
// (formatadores) real, e deixa o teste dono de cada resposta e de cada falha.
vi.mock('../lib', async () => {
  const actual = await vi.importActual<typeof import('../lib')>('../lib');
  return { ...actual, apiJson: vi.fn() };
});
vi.mock('../lib/sound', () => ({ playCartSound: vi.fn() }));

import { apiJson } from '../lib';
import { QuoteCartProvider, useQuoteCart } from './QuoteCartContext';

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

/** Responde a hidratação e a lista; cada PUT segue `putOutcomes` (true = grava, false = falha de rede). */
function arrangeApi(putOutcomes: (attempt: number) => boolean) {
  const puts: PutBody[] = [];
  apiJsonMock.mockImplementation(async (url: string, options?: { method?: string; body?: BodyInit | null }) => {
    if (options?.method === 'PUT') {
      puts.push(JSON.parse(String(options.body)) as PutBody);
      if (!putOutcomes(puts.length)) throw new Error('rede fora');
      return emptyDraft;
    }
    if (url.startsWith('/api/quotes?')) return { quotes: [] };
    return emptyDraft;
  });
  return puts;
}

const wrapper = ({ children }: { children: ReactNode }) => <QuoteCartProvider>{children}</QuoteCartProvider>;

async function mountHydrated() {
  const view = renderHook(() => useQuoteCart(), { wrapper });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(view.result.current.syncState).toBe('synced');
  return view;
}

const carburador = { partNumber: '587106701', name: 'CARBURADOR', model: '143RII' };

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  // Escopo não anônimo: sem isto o provider nem tenta hidratar (tela de login).
  localStorage.setItem('cognivault_email', 'balcao@loja.test');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('cesta: reenvio depois de falha de gravação', () => {
  it('a peça adicionada no momento da falha é reenviada sozinha, sem nova edição', async () => {
    const puts = arrangeApi(attempt => attempt > 1); // 1ª falha, 2ª grava
    const { result } = await mountHydrated();

    act(() => result.current.addItem(carburador));
    await advance(900); // debounce da gravação
    expect(puts).toHaveLength(1);
    expect(result.current.syncState).toBe('offline');

    // Antes da primeira espera da escada (2 s) nada é reenviado...
    await advance(1_900);
    expect(puts).toHaveLength(1);

    // ...e depois dela a MESMA cesta sobe, sem o atendente tocar em nada.
    await advance(100);
    expect(puts).toHaveLength(2);
    expect(result.current.syncState).toBe('synced');
    expect(puts[1].items).toEqual(puts[0].items);
  });

  it('reenviar não duplica item: o PUT leva o estado inteiro', async () => {
    const puts = arrangeApi(attempt => attempt > 2);
    const { result } = await mountHydrated();

    act(() => result.current.addItem(carburador));
    await advance(900);
    await advance(2_000);
    await advance(5_000);

    expect(puts).toHaveLength(3);
    for (const body of puts) {
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({ partNumber: '587106701', quantity: 1 });
    }
    expect(result.current.syncState).toBe('synced');
  });

  it('a espera cresce a cada falha (2 s, 5 s, 10 s)', async () => {
    const puts = arrangeApi(() => false);
    const { result } = await mountHydrated();

    act(() => result.current.addItem(carburador));
    await advance(900);
    expect(puts).toHaveLength(1);

    await advance(1_999);
    expect(puts).toHaveLength(1);
    await advance(1);
    expect(puts).toHaveLength(2);

    await advance(4_999);
    expect(puts).toHaveLength(2);
    await advance(1);
    expect(puts).toHaveLength(3);

    await advance(9_999);
    expect(puts).toHaveLength(3);
    await advance(1);
    expect(puts).toHaveLength(4);
  });

  it('a escada tem fim: depois de 6 reenvios para, e o aviso "só neste aparelho" fica', async () => {
    const puts = arrangeApi(() => false);
    const { result } = await mountHydrated();

    act(() => result.current.addItem(carburador));
    await advance(900);
    // Passo a passo, cada um com seu `act`: o efeito que agenda o próximo reenvio
    // só roda depois que o React renderiza, e um único salto de 10 min não deixa.
    // 20 passos de 30 s = 10 min, bem além dos ~1,5 min da escada inteira.
    for (let step = 0; step < 20; step += 1) await advance(30_000);

    expect(puts).toHaveLength(7); // 1 gravação inicial + 6 reenvios
    expect(result.current.syncState).toBe('offline');
    // A cesta local continua intacta: falhar não pode apagar o atendimento.
    expect(result.current.items).toHaveLength(1);
  });
});
