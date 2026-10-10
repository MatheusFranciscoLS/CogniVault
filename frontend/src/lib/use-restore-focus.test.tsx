import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useRestoreFocus } from './use-restore-focus';

function Harness({ fallbackId = 'busca', onReady }: { fallbackId?: string; onReady: (restore: () => void) => void }) {
  const restoreFocus = useRestoreFocus(() => document.getElementById(fallbackId));
  useEffect(() => { onReady(restoreFocus); }, [onReady, restoreFocus]);
  return (
    <div>
      <input id="busca" aria-label="busca" />
      <button id="linha">linha</button>
      <div role="dialog" aria-label="painel"><button id="dentro">dentro</button></div>
    </div>
  );
}

function montar(fallbackId?: string) {
  let restore: () => void = () => {};
  const view = render(<Harness fallbackId={fallbackId} onReady={fn => { restore = fn; }} />);
  return { ...view, restore: () => restore() };
}

const foco = () => document.activeElement?.id;
const esperar = () => act(async () => { await vi.advanceTimersByTimeAsync(80); });

afterEach(() => { vi.useRealTimers(); });

describe('useRestoreFocus', () => {
  it('devolve o foco ao elemento de fora do diálogo em que o atendente estava', async () => {
    vi.useFakeTimers();
    const { container, restore } = montar();
    act(() => container.querySelector<HTMLElement>('#linha')!.focus());
    act(() => container.querySelector<HTMLElement>('#dentro')!.focus()); // o painel abriu e o foco entrou nele
    expect(foco()).toBe('dentro');
    restore();
    await esperar();
    expect(foco()).toBe('linha');
  });

  it('o foco dentro do diálogo não vira "o último de fora"', async () => {
    vi.useFakeTimers();
    const { container, restore } = montar();
    act(() => container.querySelector<HTMLElement>('#busca')!.focus());
    act(() => container.querySelector<HTMLElement>('#dentro')!.focus());
    restore();
    await esperar();
    expect(foco()).toBe('busca');
  });

  it('se o elemento sumiu da página, cai no fallback (a busca)', async () => {
    vi.useFakeTimers();
    const { container, restore } = montar();
    const linha = container.querySelector<HTMLElement>('#linha')!;
    act(() => linha.focus());
    act(() => container.querySelector<HTMLElement>('#dentro')!.focus());
    act(() => linha.remove());
    restore();
    await esperar();
    expect(foco()).toBe('busca');
  });

  it('sem nada focado antes e sem fallback, não quebra', async () => {
    vi.useFakeTimers();
    const { restore } = montar('nao-existe');
    expect(() => restore()).not.toThrow();
    await esperar();
  });
});
