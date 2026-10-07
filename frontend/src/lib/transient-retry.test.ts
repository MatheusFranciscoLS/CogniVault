import { describe, expect, it, vi } from 'vitest';
import { retryTransient } from './transient-retry';

const passageiro = (error: unknown) => error instanceof Error && error.message === '502';

describe('retryTransient', () => {
  it('devolve o resultado de primeira, sem esperar', async () => {
    const sleep = vi.fn(async () => undefined);
    expect(await retryTransient(async () => 'ok', { isTransient: passageiro, waits: [5], sleep })).toBe('ok');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('espera e tenta de novo quando a falha é passageira (o 502 do deploy e o 409 de operação em andamento)', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('502'))
      .mockRejectedValueOnce(new Error('502'))
      .mockResolvedValueOnce('conferido');
    const sleep = vi.fn(async (_ms: number) => undefined);
    const onWaiting = vi.fn();
    expect(await retryTransient(run, { isTransient: passageiro, waits: [5, 10, 20], sleep, onWaiting })).toBe('conferido');
    expect(sleep.mock.calls.map(call => call[0])).toEqual([5, 10]);
    expect(onWaiting.mock.calls.map(call => call[0])).toEqual([true, false, true, false]);
  });

  it('erro que não é passageiro sobe na hora, sem esperar', async () => {
    const sleep = vi.fn(async () => undefined);
    await expect(retryTransient(async () => { throw new Error('403'); }, { isTransient: passageiro, waits: [5], sleep })).rejects.toThrow('403');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('acabadas as tentativas, lança o último erro', async () => {
    const sleep = vi.fn(async () => undefined);
    await expect(retryTransient(async () => { throw new Error('502'); }, { isTransient: passageiro, waits: [5, 10], sleep })).rejects.toThrow('502');
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('se a tela foi fechada, desiste sem erro', async () => {
    let fechada = false;
    const run = vi.fn(async () => { fechada = true; throw new Error('502'); });
    expect(await retryTransient(run, { isTransient: passageiro, waits: [5, 10], sleep: async () => undefined, shouldStop: () => fechada })).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
