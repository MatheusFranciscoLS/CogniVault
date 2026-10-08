import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiJson = vi.fn();
vi.mock('../lib', () => ({ apiJson: (...args: unknown[]) => apiJson(...args) }));

import { resolveAttendantName } from './store-profile';

describe('resolveAttendantName', () => {
  beforeEach(() => {
    localStorage.clear();
    apiJson.mockReset();
  });

  it('pergunta ao servidor e guarda: sessão aberta antes de o nome existir passa a ter o ATT.', async () => {
    localStorage.setItem('cognivault_email', 'matheusfran.ls@hotmail.com');
    apiJson.mockResolvedValue({ user: { name: 'Matheus Francisco' } });
    expect(await resolveAttendantName()).toBe('Matheus Francisco');
    expect(localStorage.getItem('cognivault_name')).toBe('Matheus Francisco');
  });

  it('sem rede, vale o nome que já estava guardado', async () => {
    localStorage.setItem('cognivault_name', 'Ana Souza');
    apiJson.mockRejectedValue(new Error('offline'));
    expect(await resolveAttendantName()).toBe('Ana Souza');
  });

  it('nome apagado no cadastro apaga o do navegador, e e-mail fora do formato não inventa nome', async () => {
    localStorage.setItem('cognivault_name', 'Ana Souza');
    localStorage.setItem('cognivault_email', 'matheusfran.ls@hotmail.com');
    apiJson.mockResolvedValue({ user: { name: null } });
    expect(await resolveAttendantName()).toBe('');
  });
});
