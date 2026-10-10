import { useState } from 'react';

/**
 * A aba selecionada vai no endereço (`?aba=demanda`): recarregar, favoritar e os atalhos de outras telas abrem na aba certa.
 * `params` liga cada aba ao texto do endereço; a primeira aba é a padrão e fica sem `?aba=`. Valor desconhecido cai na primeira.
 * O endereço só reflete o estado (`replaceState`): trocar de aba não recarrega nem empilha histórico.
 */
export function readUrlTab<T extends string>(params: Record<T, string>, search: string): T {
  const ids = Object.keys(params) as T[];
  const wanted = new URLSearchParams(search).get('aba');
  return ids.find(id => params[id] === wanted) ?? ids[0];
}

export function useUrlTab<T extends string>(params: Record<T, string>): [T, (next: T) => void] {
  const [tab, setTabState] = useState<T>(() => readUrlTab(params, window.location.search));
  const setTab = (next: T) => {
    setTabState(next);
    const first = (Object.keys(params) as T[])[0];
    const query = next === first ? '' : `?aba=${params[next]}`;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query}`);
  };
  return [tab, setTab];
}
