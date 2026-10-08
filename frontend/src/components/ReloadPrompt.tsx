/// <reference types="vite-plugin-pwa/client" />

import { useRegisterSW } from 'virtual:pwa-register/react';

export default function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (registration) {
        window.setInterval(() => {
          void registration.update();
        }, 60 * 60 * 1000);
      }
    },

    onRegisterError(error) {
      console.error('Erro ao registrar Service Worker', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-110 rounded-xl border border-border bg-card p-4 shadow-lg sm:inset-x-auto sm:right-4 sm:w-[360px]"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-xs font-black text-brand-600 dark:bg-brand-950/40 dark:text-brand-300" aria-hidden="true">
          ↑
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-foreground">Nova versão disponível</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Atualize o CogniVault para usar a versão mais recente sem perder o orçamento salvo.
          </p>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="rounded-lg px-3 py-2 text-xs font-bold text-muted-foreground transition hover:bg-ink-100 dark:hover:bg-ink-800"
        >
          Depois
        </button>
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="rounded-lg bg-ink-900 px-4 py-2 text-xs font-black text-white transition hover:bg-ink-950"
        >
          Atualizar agora
        </button>
      </div>
    </aside>
  );
}
