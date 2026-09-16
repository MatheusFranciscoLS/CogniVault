import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  COUNTER_SESSION_STORAGE_KEY,
  CounterSessionContext,
  EMPTY_COUNTER_SESSION,
  type CounterSession,
  type CounterSessionContextValue,
} from './counterSession';

function readStoredSession(): CounterSession {
  try {
    const raw = localStorage.getItem(COUNTER_SESSION_STORAGE_KEY);
    if (!raw) return EMPTY_COUNTER_SESSION;
    const parsed = JSON.parse(raw) as Partial<CounterSession>;
    return {
      customerName: typeof parsed.customerName === 'string' ? parsed.customerName : '',
      machineModel: typeof parsed.machineModel === 'string' ? parsed.machineModel : '',
      pnc: typeof parsed.pnc === 'string' ? parsed.pnc : '',
    };
  } catch {
    return EMPTY_COUNTER_SESSION;
  }
}

export function CounterSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CounterSession>(readStoredSession);

  useEffect(() => {
    try {
      const hasValue = Boolean(session.customerName.trim() || session.machineModel.trim() || session.pnc.trim());
      if (hasValue) localStorage.setItem(COUNTER_SESSION_STORAGE_KEY, JSON.stringify(session));
      else localStorage.removeItem(COUNTER_SESSION_STORAGE_KEY);
    } catch {
      // Contexto de atendimento é conveniência local; falhas de storage não bloqueiam a operação.
    }
  }, [session]);

  const value = useMemo<CounterSessionContextValue>(() => ({
    session,
    hasContext: Boolean(session.machineModel.trim() || session.pnc.trim()),
    updateSession: patch => setSession(current => ({ ...current, ...patch })),
    clearSession: () => setSession(EMPTY_COUNTER_SESSION),
  }), [session]);

  return <CounterSessionContext.Provider value={value}>{children}</CounterSessionContext.Provider>;
}
