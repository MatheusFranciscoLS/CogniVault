import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib', () => ({ api: vi.fn() }));

import { api } from '../lib';
import { reportSearchMiss, resetSearchMissMemory } from './search-miss';

const apiMock = vi.mocked(api);

beforeEach(() => {
  resetSearchMissMemory();
  apiMock.mockReset();
  apiMock.mockResolvedValue(new Response(null, { status: 202 }));
});
afterEach(() => vi.restoreAllMocks());

describe('reportSearchMiss', () => {
  it('manda só o texto digitado, uma vez', () => {
    reportSearchMiss('  Vela Z1  ');
    expect(apiMock).toHaveBeenCalledTimes(1);
    const [path, init] = apiMock.mock.calls[0];
    expect(path).toBe('/api/search/miss');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ query: 'Vela Z1' });
  });

  it('o mesmo texto (mesmo com outra caixa ou espaço) não conta duas vezes na mesma página', () => {
    reportSearchMiss('vela z1');
    reportSearchMiss('VELA   Z1 ');
    expect(apiMock).toHaveBeenCalledTimes(1);
    reportSearchMiss('outra coisa');
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it('texto curto ou vazio não é enviado', () => {
    for (const text of ['', ' ', 'a']) reportSearchMiss(text);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('falha de rede não lança e deixa tentar de novo depois', async () => {
    apiMock.mockRejectedValueOnce(new Error('rede'));
    expect(() => reportSearchMiss('peça rara')).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    reportSearchMiss('peça rara');
    expect(apiMock).toHaveBeenCalledTimes(2);
  });
});
