import { beforeEach, describe, expect, it } from 'vitest';
import { activateQuoteStorageScope } from './quote-storage-scope';

describe('cesta por usuário no navegador', () => {
  beforeEach(() => localStorage.clear());

  it('a cesta de CONSERTO (cliente, OS) não passa para o próximo atendente do mesmo PC', () => {
    localStorage.setItem('cognivault_email', 'ana@loja.test');
    activateQuoteStorageScope('ana@loja.test');
    localStorage.setItem('cognivault_repair_cart', JSON.stringify([{ name: 'DA ANA' }]));
    localStorage.setItem('cognivault_repair_draft_options', JSON.stringify({ customerName: 'Cliente da Ana', docNumber: '5555' }));
    localStorage.setItem('cognivault_repair_unsynced', '123');
    localStorage.setItem('cognivault_quote_unsynced', '456');

    activateQuoteStorageScope('bruno@loja.test');
    for (const key of ['cognivault_repair_cart', 'cognivault_repair_draft_options', 'cognivault_repair_history', 'cognivault_repair_unsynced', 'cognivault_quote_unsynced']) {
      expect(localStorage.getItem(key), key).toBeNull();
    }

    activateQuoteStorageScope('ana@loja.test');
    expect(localStorage.getItem('cognivault_repair_cart')).toContain('DA ANA');
    expect(localStorage.getItem('cognivault_repair_draft_options')).toContain('Cliente da Ana');
    expect(localStorage.getItem('cognivault_repair_unsynced')).toBe('123');
    expect(localStorage.getItem('cognivault_quote_unsynced')).toBe('456');
  });

  it('sair da conta deixa as chaves limpas para quem entrar depois', () => {
    localStorage.setItem('cognivault_email', 'ana@loja.test');
    activateQuoteStorageScope('ana@loja.test');
    localStorage.setItem('cognivault_repair_cart', JSON.stringify([{ name: 'DA ANA' }]));
    activateQuoteStorageScope('anonymous');
    expect(localStorage.getItem('cognivault_repair_cart')).toBeNull();
  });
});
