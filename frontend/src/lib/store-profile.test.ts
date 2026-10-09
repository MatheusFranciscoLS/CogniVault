import { describe, expect, it } from 'vitest';
import { QUOTE_DEFAULTS, STORE_PROFILE, attendantDisplayName, attendantNameFromEmail } from './store-profile';

describe('attendantNameFromEmail', () => {
  it('"nome.sobrenome@loja" vira "Nome Sobrenome"', () => {
    expect(attendantNameFromEmail('matheus.francisco@vardao.com.br')).toBe('Matheus Francisco');
    expect(attendantNameFromEmail('ANA_SOUZA@x.com')).toBe('Ana Souza');
  });
  it('não inventa nome: e-mail fora do formato "nome.sobrenome" não vira nome (matheusfran.ls saía "Matheusf Ls")', () => {
    expect(attendantNameFromEmail('matheusfran.ls@gmail.com')).toBe('');
    expect(attendantNameFromEmail('balcao2@loja.test')).toBe('');
    expect(attendantNameFromEmail('balcao@loja.test')).toBe('');
    expect(attendantNameFromEmail('joao.s@loja.test')).toBe('');
    expect(attendantNameFromEmail('a@x.com')).toBe('');
    expect(attendantNameFromEmail('')).toBe('');
    expect(attendantNameFromEmail(null)).toBe('');
  });
});

describe('attendantDisplayName', () => {
  const guardar = (nome: string | null, email: string | null) => {
    for (const [chave, valor] of [['cognivault_name', nome], ['cognivault_email', email]] as const) {
      if (valor === null) localStorage.removeItem(chave); else localStorage.setItem(chave, valor);
    }
  };

  it('o nome cadastrado pelo administrador manda', () => {
    guardar('Matheus Francisco', 'matheusfran.ls@gmail.com');
    expect(attendantDisplayName()).toBe('Matheus Francisco');
  });

  it('sem nome cadastrado, vale a reserva do e-mail; sem nenhuma das duas, vazio (a linha ATT. some)', () => {
    guardar(null, 'ana.souza@loja.test');
    expect(attendantDisplayName()).toBe('Ana Souza');
    guardar(null, 'matheusfran.ls@gmail.com');
    expect(attendantDisplayName()).toBe('');
    guardar('   ', null);
    expect(attendantDisplayName()).toBe('');
  });
});

describe('perfil e padrões da loja', () => {
  it('os padrões são os do modelo em Word', () => {
    expect(QUOTE_DEFAULTS.validityDays).toBe(20);
    expect(QUOTE_DEFAULTS.shipping).toBe('Retira');
    expect(QUOTE_DEFAULTS.leadTimeNow).toBe('Pronta entrega');
    expect(QUOTE_DEFAULTS.leadTimeOrder).toBe('7 a 10 dias');
    expect(QUOTE_DEFAULTS.observations).toHaveLength(3);
  });
  it('o CNPJ tem a máscara completa', () => {
    expect(STORE_PROFILE.cnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
  });
});
