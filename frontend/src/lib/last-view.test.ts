import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLastView, writeLastView } from './last-view';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('última vista por máquina', () => {
  it('guarda e devolve por PNC, e uma máquina não mexe na outra', () => {
    writeLastView('967332901', 'HVA_PL-123');
    writeLastView('970466903', 'HVA_PL-999');
    expect(readLastView('967332901')).toBe('HVA_PL-123');
    expect(readLastView('970466903')).toBe('HVA_PL-999');
    expect(readLastView('960410052')).toBe('');
  });

  it('PNC com máscara, 11 dígitos ou sufixo BR vale como os 9 primeiros dígitos', () => {
    writeLastView('967 33 29-01', 'V1');
    expect(readLastView('96733290100')).toBe('V1');
    expect(readLastView('967332901BR')).toBe('V1');
  });

  it('PNC curto, vazio ou vista vazia não grava nada', () => {
    for (const pnc of ['', '123', null, undefined, 'abc']) writeLastView(pnc, 'V1');
    writeLastView('967332901', '');
    expect(localStorage.length).toBe(0);
    expect(readLastView('')).toBe('');
    expect(readLastView(undefined)).toBe('');
  });

  it('valor gigante no armazenamento é ignorado', () => {
    localStorage.setItem('cognivault_last_view:967332901', 'x'.repeat(500));
    expect(readLastView('967332901')).toBe('');
    writeLastView('967332901', 'x'.repeat(500));
    expect(localStorage.getItem('cognivault_last_view:967332901')).toBe('x'.repeat(500));
  });

  it('armazenamento bloqueado ou cheio não lança', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cheio'); });
    expect(() => writeLastView('967332901', 'V1')).not.toThrow();
    expect(readLastView('967332901')).toBe('');
  });
});
