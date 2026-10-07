import { createContext, useContext } from 'react';

/**
 * Pergunta de confirmação do próprio site, no lugar do `window.confirm` do navegador (uma janela feia, em inglês
 * em alguns navegadores, que some atrás de outras e não segue o tema). O texto diz o que será perdido e o botão
 * diz o que ele faz: "Esvaziar", e não "OK".
 */
export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Ação que apaga ou perde dado: o botão fica vermelho e o foco começa em "Cancelar". */
  destructive?: boolean;
};

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm deve ser usado dentro de ConfirmProvider.');
  return confirm;
}
