import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  COUNTER_SESSION_STORAGE_KEY,
  CounterSessionContext,
  EMPTY_COUNTER_SESSION,
  counterSessionStorageKey,
  type CounterSession,
  type CounterSessionContextValue,
} from './counterSession';

function readStoredSession(storageKey: string): CounterSession {
  try {
    // Migra uma sessão antiga não-escopada uma única vez para não perder o
    // atendimento atual, mas toda gravação nova passa a ser separada por usuário.
    const raw = localStorage.getItem(storageKey)
      || (storageKey !== COUNTER_SESSION_STORAGE_KEY ? localStorage.getItem(COUNTER_SESSION_STORAGE_KEY) : null);
    if (!raw) return EMPTY_COUNTER_SESSION;
    const parsed = JSON.parse(raw) as Partial<CounterSession>;
    return {
      customerName: typeof parsed.customerName === 'string' ? parsed.customerName : '',
      machineModel: typeof parsed.machineModel === 'string' ? parsed.machineModel : '',
      pnc: typeof parsed.pnc === 'string' ? parsed.pnc : '',
      serial: typeof parsed.serial === 'string' ? parsed.serial : '',
    };
  } catch {
    return EMPTY_COUNTER_SESSION;
  }
}

export function CounterSessionProvider({ children }: { children: ReactNode }) {
  const storageKey = useMemo(() => counterSessionStorageKey(), []);
  const [session, setSession] = useState<CounterSession>(() => readStoredSession(storageKey));

  useEffect(() => {
    try {
      const hasValue = Boolean(session.customerName.trim() || session.machineModel.trim() || session.pnc.trim() || session.serial.trim());
      if (hasValue) {
        localStorage.setItem(storageKey, JSON.stringify(session));
        if (storageKey !== COUNTER_SESSION_STORAGE_KEY) localStorage.removeItem(COUNTER_SESSION_STORAGE_KEY);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Contexto de atendimento é conveniência local; falhas de storage não bloqueiam a operação.
    }
  }, [session, storageKey]);

  const value = useMemo<CounterSessionContextValue>(() => ({
    session,
    hasContext: Boolean(session.machineModel.trim() || session.pnc.trim() || session.serial.trim()),
    updateSession: patch => setSession(current => ({ ...current, ...patch })),
    clearSession: () => setSession(EMPTY_COUNTER_SESSION),
  }), [session]);

  return <CounterSessionContext.Provider value={value}>{children}</CounterSessionContext.Provider>;
}
