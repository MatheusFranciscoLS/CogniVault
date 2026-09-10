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

  if (!needRefresh) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)] animate-in slide-in-from-bottom-5 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex gap-3">
        <div className="text-3xl" aria-hidden="true">
          🚀
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Atualização Disponível
          </h3>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Uma nova versão do CogniVault está pronta. Atualize para receber as melhorias mais recentes!
          </p>
        </div>
      </div>

      <div className="mt-1 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          Ignorar
        </button>

        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="rounded-lg bg-[#1d4f91] px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#153e75]"
        >
          Atualizar Agora
        </button>
      </div>
    </div>
  );
}
