import { describe, expect, it } from 'vitest';
import { QUOTE_DEFAULTS, STORE_PROFILE, attendantNameFromEmail } from './store-profile';

describe('attendantNameFromEmail', () => {
  it('"nome.sobrenome@loja" vira "Nome Sobrenome"', () => {
    expect(attendantNameFromEmail('matheus.francisco@vardao.com.br')).toBe('Matheus Francisco');
    expect(attendantNameFromEmail('ANA_SOUZA@x.com')).toBe('Ana Souza');
  });
  it('ignora número e inicial solta, e não inventa nome quando não há', () => {
    expect(attendantNameFromEmail('balcao2@loja.test')).toBe('Balcao');
    expect(attendantNameFromEmail('a@x.com')).toBe('');
    expect(attendantNameFromEmail('')).toBe('');
    expect(attendantNameFromEmail(null)).toBe('');
  });
});

describe('perfil e padrões da loja', () => {
  it('os padrões são os do modelo em Word', () => {
    expect(QUOTE_DEFAULTS.validityDays).toBe(20);
    expect(QUOTE_DEFAULTS.shipping).toBe('Retira');
    expect(QUOTE_DEFAULTS.leadTime).toBe('IMEDIATO');
    expect(QUOTE_DEFAULTS.observations).toHaveLength(3);
  });
  it('o CNPJ tem a máscara completa', () => {
    expect(STORE_PROFILE.cnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
  });
});
