import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from './confirm';

type Pending = ConfirmOptions & { resolve: (value: boolean) => void };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  useEffect(() => { pendingRef.current = pending; }, [pending]);

  const confirm = useCallback<ConfirmFn>(options => new Promise<boolean>(resolve => {
    // Uma pergunta nova com outra aberta recusa a antiga: nunca deixa uma promessa pendurada.
    pendingRef.current?.resolve(false);
    setPending({ ...options, resolve });
  }), []);

  // Se o provedor sair da tela com uma pergunta aberta, ela conta como "não".
  useEffect(() => () => { pendingRef.current?.resolve(false); }, []);

  const finish = (answer: boolean) => {
    pending?.resolve(answer);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={pending !== null} onOpenChange={open => { if (!open) finish(false); }}>
        <AlertDialogContent size="default" className="max-w-md sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-semibold">{pending?.title}</AlertDialogTitle>
            {pending?.description ? <AlertDialogDescription className="text-base">{pending.description}</AlertDialogDescription> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Ação que perde dado: "Cancelar" é o primeiro da ordem de foco, e Enter não apaga sem querer. */}
            <AlertDialogCancel onClick={() => finish(false)}>{pending?.cancelLabel ?? 'Cancelar'}</AlertDialogCancel>
            <AlertDialogAction variant={pending?.destructive ? 'destructive' : 'default'} onClick={() => finish(true)}>
              {pending?.confirmLabel ?? 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
