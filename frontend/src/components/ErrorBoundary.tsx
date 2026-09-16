import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-[100dvh] place-items-center bg-[#f5f7fb] p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-6">
          <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-rose-50 text-sm font-black text-rose-600 dark:bg-rose-950/40 dark:text-rose-300" aria-hidden="true">!</div>
            <h1 className="mt-4 text-xl font-black tracking-[-.03em] text-slate-950 dark:text-white">Não foi possível carregar esta tela</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
              O CogniVault encontrou um erro inesperado. Recarregue a página para tentar novamente. Se o problema continuar, informe à equipe responsável o que você estava fazendo no momento do erro.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 w-full rounded-lg bg-[#123867] px-5 py-2.5 text-sm font-black text-white transition hover:bg-[#0d2c52] sm:w-auto"
            >
              Recarregar página
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
