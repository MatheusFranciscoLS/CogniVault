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
    hasError: false
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
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/50 p-6 text-slate-800 dark:text-slate-200 dark:bg-slate-900 dark:text-slate-200">
          <div className="cv-surface max-w-md rounded-2xl p-8 text-center shadow-xl">
            <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">Oops! Algo deu errado.</h2>
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-400">
              Ocorreu um erro inesperado ao carregar esta tela.
            </p>
            <div className="mt-4 overflow-auto rounded-xl bg-slate-100 dark:bg-slate-700 p-4 text-left text-xs text-slate-700 dark:text-slate-300 dark:bg-slate-800 dark:text-slate-300">
              <code>{this.state.error?.message || 'Erro desconhecido'}</code>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-xl bg-blue-600 px-6 py-2.5 font-semibold text-white transition hover:bg-blue-700"
            >
              Recarregar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
