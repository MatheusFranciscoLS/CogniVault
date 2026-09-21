import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Fecha o painel. É a única saída oferecida: o atendimento continua atrás. */
  onClose: () => void;
  /** Rótulo do botão, quando "Fechar" não for a palavra certa. */
  closeLabel?: string;
};

type State = { hasError: boolean };

/**
 * Barreira de erro por painel.
 *
 * **O projeto tinha uma única barreira, na raiz** (`App.tsx`), e isso já custou
 * a tela inteira uma vez: `SourceBadge` recebeu um tipo que o mapa dele não
 * conhecia, leu `.title` de `undefined`, e o atendimento virou "Não foi
 * possível carregar esta tela". O conserto daquela vez foi pontual — o mapa
 * ganhou um `??`. A estrutura continuou igual, e qualquer componente novo
 * dentro da gaveta ou do painel lateral tem o mesmo poder de apagar tudo.
 *
 * O que está em jogo não é o painel: é o que fica ATRÁS dele. A busca que o
 * atendente acabou de fazer, a cesta que ele montou com o cliente na frente, e
 * o contexto da máquina. Nada disso precisa morrer porque a vista explodida
 * veio com um campo a menos.
 *
 * Com a barreira por painel, um erro fecha aquele painel e devolve o atendente
 * exatamente onde ele estava.
 *
 * **O texto é ação, não explicação** — regra do dono: *"o atendente quer a peça
 * e nao a explicação"*. O detalhe técnico vai para o console, que é onde ele
 * serve para alguma coisa.
 */
export class PanelErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Painel interrompido por erro:', error, errorInfo);
  }

  public render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        className="fixed inset-x-0 bottom-0 z-[120] border-t border-ink-200 bg-white p-4 shadow-lg dark:border-ink-700 dark:bg-ink-900 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[360px] sm:border-l sm:border-t-0"
      >
        <div className="flex h-full flex-col items-start justify-center gap-4">
          <div className="flex items-start gap-3">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-50 text-sm font-black text-rose-600 dark:bg-rose-950/40 dark:text-rose-300"
              aria-hidden="true"
            >
              !
            </div>
            <p className="text-sm font-black leading-6 text-ink-900 dark:text-white">
              Não foi possível abrir este painel.
            </p>
          </div>
          <button
            type="button"
            onClick={this.props.onClose}
            className="cv-touch-target w-full rounded-lg bg-ink-900 px-4 text-sm font-black text-white transition hover:bg-ink-950 sm:w-auto"
          >
            {this.props.closeLabel ?? 'Fechar'}
          </button>
        </div>
      </div>
    );
  }
}
