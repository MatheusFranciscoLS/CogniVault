import { describe, expect, it } from 'vitest';
import { categoryLabel } from './category-label';

describe('categoryLabel', () => {
  it('tudo em maiúscula vira frase; o que já tem minúscula não é mexido', () => {
    expect(categoryLabel('MOTOSSERRA')).toBe('Motosserra');
    expect(categoryLabel('ROÇADEIRA COSTAL')).toBe('Roçadeira costal');
    expect(categoryLabel('Roçadeiras')).toBe('Roçadeiras');
    expect(categoryLabel('Cortador de grama')).toBe('Cortador de grama');
  });
  it('vazio e nulo', () => {
    expect(categoryLabel('')).toBe('');
    expect(categoryLabel(null)).toBe('');
    expect(categoryLabel(undefined)).toBe('');
  });
  it('sigla curta em maiúscula vira palavra (decisão conhecida: só a primeira letra fica grande)', () => {
    expect(categoryLabel('IPL')).toBe('Ipl');
  });
});
