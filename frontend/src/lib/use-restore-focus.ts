import { useCallback, useEffect, useRef } from 'react';

/**
 * Teclado primeiro: ao FECHAR um painel (peça, máquina), o foco volta para onde o atendente estava, em vez de pular para o começo da página
 * ("Ir para o conteúdo"). Painéis do Atendimento são montados só quando abrem (sem botão-gatilho para o Radix devolver o foco), então guardamos o
 * último elemento focado FORA de diálogos e menus e devolvemos o foco a ele. Se ele sumiu (a lista foi refeita), vai para `fallback` (a busca).
 * Chame o retorno só nos fechamentos do próprio atendente (Esc, X, clique fora): quando o painel fecha porque uma busca nova começou, quem
 * cuida do foco é a busca.
 */
export function useRestoreFocus(fallback: () => HTMLElement | null | undefined) {
  const last = useRef<HTMLElement | null>(null);
  const fallbackRef = useRef(fallback);
  useEffect(() => { fallbackRef.current = fallback; });

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && !target.closest('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]')) last.current = target;
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  return useCallback(() => {
    // Depois do próprio retorno de foco do Radix (setTimeout 0): o nosso vale.
    window.setTimeout(() => {
      const element = last.current;
      const target = element && element.isConnected ? element : fallbackRef.current();
      target?.focus({ preventScroll: true });
    }, 60);
  }, []);
}
