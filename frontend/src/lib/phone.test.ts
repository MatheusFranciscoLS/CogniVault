import { describe, expect, it } from 'vitest';
import { maskPhoneInput } from './phone';

describe('maskPhoneInput', () => {
  it('monta a máscara aos poucos, dígito a dígito', () => {
    const passos = ['1', '19', '199', '1998', '19987', '199876', '1998765', '19987654', '199876543', '1998765432', '19987654321'];
    expect(passos.map(maskPhoneInput)).toEqual([
      '(1', '(19', '(19) 9', '(19) 98', '(19) 987', '(19) 9876', '(19) 9876-5', '(19) 9876-54', '(19) 9876-543', '(19) 9876-5432', '(19) 98765-4321',
    ]);
  });

  it('colar com ou sem máscara dá o mesmo resultado', () => {
    expect(maskPhoneInput('(19) 98765-4321')).toBe('(19) 98765-4321');
    expect(maskPhoneInput('19 98765 4321')).toBe('(19) 98765-4321');
    expect(maskPhoneInput('1933334444')).toBe('(19) 3333-4444');
  });

  it('descarta o 55 do contato colado e corta o excesso', () => {
    expect(maskPhoneInput('+55 19 98765-4321')).toBe('(19) 98765-4321');
    expect(maskPhoneInput('5519987654321')).toBe('(19) 98765-4321');
    expect(maskPhoneInput('199876543219999')).toBe('(19) 98765-4321');
  });

  it('vazio e lixo viram vazio', () => {
    expect(maskPhoneInput('')).toBe('');
    expect(maskPhoneInput('abc')).toBe('');
    expect(maskPhoneInput('()')).toBe('');
  });
});
