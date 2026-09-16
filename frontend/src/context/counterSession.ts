import { createContext, useContext } from 'react';

export type CounterSession = {
  customerName: string;
  machineModel: string;
  pnc: string;
};

export type CounterSessionContextValue = {
  session: CounterSession;
  hasContext: boolean;
  updateSession: (patch: Partial<CounterSession>) => void;
  clearSession: () => void;
};

export const EMPTY_COUNTER_SESSION: CounterSession = {
  customerName: '',
  machineModel: '',
  pnc: '',
};

export const COUNTER_SESSION_STORAGE_KEY = 'cognivault_counter_session';
export const CounterSessionContext = createContext<CounterSessionContextValue | null>(null);

export function useCounterSession() {
  const context = useContext(CounterSessionContext);
  if (!context) throw new Error('useCounterSession deve ser usado dentro de CounterSessionProvider.');
  return context;
}
