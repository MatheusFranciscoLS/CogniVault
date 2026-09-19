import { useEffect, useRef } from 'react';
import MachineDetail from './MachineDetail';
import type { MachineDetailLoaded } from './MachineDetail';

/**
 * A máquina abre AO LADO do atendimento, não em outra aba.
 *
 * É a opção que o dono escolheu quando perguntei como juntar as duas telas
 * ("eu gostei do painel lateral"), e o motivo é o fluxo do balcão: ele digita a
 * peça, olha a vista explodida para confirmar a posição e volta para a lista —
 * trocar de aba perdia a lista e o contexto no meio do atendimento.
 *
 * Largo de propósito (até 980px). A vista explodida do carburador tem mais de
 * 20 posições numeradas; num painel de 320px o zoom não salva, porque não há
 * para onde arrastar. O zoom continua lá dentro, vindo do `ExplodedView`.
 *
 * Nessa largura o kit de manutenção cabe, então o painel mostra o mesmo
 * conteúdo que a tela de máquinas mostrava: documentos, vista e kit.
 */
export default function MachineSidePanel({
  pnc,
  contextModel,
  onClose,
  onOpenPnc,
  onOpenPart,
  onOpenSearch,
  onLoaded,
}: {
  pnc: string;
  contextModel?: string;
  onClose: () => void;
  onOpenPnc: (pnc: string) => void;
  onOpenPart: (code: string) => void;
  onOpenSearch?: (term: string) => void;
  onLoaded?: (machine: MachineDetailLoaded) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[85] flex justify-end">
      <button
        type="button"
        aria-label="Fechar máquina"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/50 backdrop-blur-[1px]"
      />
      <aside
        role="dialog"
        aria-label="Máquina aberta"
        aria-modal="true"
        className="relative z-10 flex h-full w-full max-w-[980px] flex-col bg-surface-page shadow-2xl dark:bg-surface-page-dark"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-200 bg-white px-4 py-3 dark:border-ink-800 dark:bg-ink-900">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[.14em] text-brand-600 dark:text-brand-300">Máquina do cliente</div>
            <div className="truncate font-mono text-sm font-black text-ink-900 dark:text-white">PNC {pnc}</div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="cv-touch-target shrink-0 rounded-card border border-ink-200 px-4 text-xs font-bold text-ink-600 transition hover:border-brand-300 hover:text-brand-700 dark:border-ink-700 dark:text-ink-300"
          >
            Fechar
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <MachineDetail
            pnc={pnc}
            contextModel={contextModel}
            onOpenPnc={onOpenPnc}
            onOpenPart={onOpenPart}
            onOpenSearch={onOpenSearch}
            onLoaded={onLoaded}
          />
        </div>
      </aside>
    </div>
  );
}
