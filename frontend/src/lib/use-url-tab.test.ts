import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { readUrlTab, useUrlTab } from './use-url-tab';

const PARAMS = { summary: 'resumo', demand: 'demanda', prices: 'lista' } as const;

describe('readUrlTab', () => {
  it('lê a aba do endereço e cai na primeira quando falta ou é desconhecida', () => {
    expect(readUrlTab(PARAMS, '?aba=demanda')).toBe('demand');
    expect(readUrlTab(PARAMS, '?aba=lista&x=1')).toBe('prices');
    expect(readUrlTab(PARAMS, '')).toBe('summary');
    expect(readUrlTab(PARAMS, '?aba=lixo')).toBe('summary');
    expect(readUrlTab(PARAMS, '?aba=')).toBe('summary');
  });
});

describe('useUrlTab', () => {
  it('abre na aba do endereço e escreve a troca no endereço sem empilhar histórico', () => {
    window.history.replaceState(null, '', '/administracao/negocio?aba=lista');
    const before = window.history.length;
    const { result } = renderHook(() => useUrlTab(PARAMS));
    expect(result.current[0]).toBe('prices');
    act(() => result.current[1]('demand'));
    expect(result.current[0]).toBe('demand');
    expect(window.location.search).toBe('?aba=demanda');
    act(() => result.current[1]('summary'));
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/administracao/negocio');
    expect(window.history.length).toBe(before);
  });
});
