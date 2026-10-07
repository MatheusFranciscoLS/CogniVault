import type { KeyboardEvent } from 'react';

/**
 * Teclado primeiro na lista de resultados (o balcão é mouse e teclado, e o cliente está esperando):
 *
 * - ↓ / ↑ percorrem o código de cada linha, na ordem em que aparecem na TELA (os grupos podem trocar de ordem
 *   com CSS, então a posição vertical manda, não a ordem do DOM);
 * - Enter copia o código (é o próprio botão, sem código novo aqui);
 * - `+` põe a linha no orçamento;
 * - ↑ na primeira linha volta para o campo de busca, e ↓ no campo de busca vai para a primeira linha.
 */
export const ROW_COPY = '[data-row-copy]';
export const ROW_ADD = '[data-row-add]';
const SEARCH_INPUT = 'input[name="busca"]';

/** Botões de copiar código, de cima para baixo. */
export function orderedRowButtons(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(ROW_COPY)]
    .map((button, order) => ({ button, order, top: button.getBoundingClientRect().top }))
    .sort((a, b) => a.top - b.top || a.order - b.order)
    .map(item => item.button);
}

/** Do campo de busca para a primeira linha de resultado. Devolve se havia linha para focar. */
export function focusFirstResult(root: ParentNode = document): boolean {
  const first = orderedRowButtons(root)[0];
  if (!first) return false;
  first.focus();
  first.scrollIntoView?.({ block: 'nearest' });
  return true;
}

export function onResultsKeyDown(event: KeyboardEvent<HTMLElement>): void {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target as HTMLElement;
  // Campo de texto e menu aberto têm as próprias setas.
  if (target.closest('input, textarea, select, [role="menu"], [contenteditable="true"]')) return;
  const row = target.closest('article');
  if (!row) return;

  if (event.key === '+') {
    const add = row.querySelector<HTMLElement>(ROW_ADD);
    if (add) {
      event.preventDefault();
      add.click();
    }
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

  const buttons = orderedRowButtons(event.currentTarget);
  const here = row.querySelector<HTMLElement>(ROW_COPY);
  const index = here ? buttons.indexOf(here) : -1;
  event.preventDefault();

  if (event.key === 'ArrowUp' && index <= 0) {
    document.querySelector<HTMLInputElement>(SEARCH_INPUT)?.focus();
    return;
  }
  const next = buttons[event.key === 'ArrowDown' ? Math.min(index + 1, buttons.length - 1) : index - 1];
  next?.focus();
  next?.scrollIntoView?.({ block: 'nearest' });
}
