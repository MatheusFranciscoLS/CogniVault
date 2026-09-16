import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type CounterSession = {
  customerName: string;
  machineModel: string;
  pnc: string;
};

type CounterSessionContextValue = {
  session: CounterSession;
  hasContext: boolean;
  updateSession: (patch: Partial<CounterSession>) => void;
  clearSession: () => void;
};

const EMPTY_SESSION: CounterSession = {
  customerName: '',
  machineModel: '',
  pnc: '',
};

const STORAGE_KEY = 'cognivault_counter_session';
const CounterSessionContext = createContext<CounterSessionContextValue | null>(null);

function readStoredSession(): CounterSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SESSION;
    const parsed = JSON.parse(raw) as Partial<CounterSession>;
    return {
      customerName: typeof parsed.customerName === 'string' ? parsed.customerName : '',
      machineModel: typeof parsed.machineModel === 'string' ? parsed.machineModel : '',
      pnc: typeof parsed.pnc === 'string' ? parsed.pnc : '',
    };
  } catch {
    return EMPTY_SESSION;
  }
}

export function CounterSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CounterSession>(readStoredSession);

  useEffect(() => {
    try {
      const hasValue = Boolean(session.customerName.trim() || session.machineModel.trim() || session.pnc.trim());
      if (hasValue) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Contexto de atendimento é conveniência local; falhas de storage não bloqueiam a operação.
    }
  }, [session]);

  const value = useMemo<CounterSessionContextValue>(() => ({
    session,
    hasContext: Boolean(session.machineModel.trim() || session.pnc.trim()),
    updateSession: patch => setSession(current => ({ ...current, ...patch })),
    clearSession: () => setSession(EMPTY_SESSION),
  }), [session]);

  return <CounterSessionContext.Provider value={value}>{children}</CounterSessionContext.Provider>;
}

export function useCounterSession() {
  const context = useContext(CounterSessionContext);
  if (!context) throw new Error('useCounterSession deve ser usado dentro de CounterSessionProvider.');
  return context;
}
