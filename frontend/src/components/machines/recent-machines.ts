import { useCallback, useState } from 'react';

export type RecentMachine = { pnc: string; name: string; meta: string | null };

const RECENT_LIMIT = 8;

function storageKey(scope?: string) {
  return `cognivault_recent_machines${scope ? `:${scope}` : ''}`;
}

function read(scope?: string): RecentMachine[] {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RecentMachine => typeof item === 'object' && item !== null && typeof (item as RecentMachine).pnc === 'string')
      .slice(0, RECENT_LIMIT);
  } catch {
    // Modo privativo ou storage bloqueado: o balcão só perde os atalhos.
    return [];
  }
}

/**
 * Máquinas que este atendente abriu, por aparelho.
 *
 * Saiu de dentro de `MachinesWorkspace` quando o atendimento e as máquinas
 * viraram uma tela só. É o atalho mais usado do balcão: no dia a dia poucas
 * máquinas repetem muito, e digitar o PNC da etiqueta de novo com o cliente
 * na frente é o tipo de atrito que a tela existe para tirar.
 *
 * Por aparelho de propósito, não por conta: quem atende naquele balcão é quem
 * se beneficia da lista, e ela não tem valor consolidado para o dono.
 */
export function useRecentMachines(scope?: string) {
  const [recent, setRecent] = useState<RecentMachine[]>(() => read(scope));

  const remember = useCallback((machine: RecentMachine) => {
    setRecent(current => {
      const next = [machine, ...current.filter(item => item.pnc !== machine.pnc)].slice(0, RECENT_LIMIT);
      try {
        localStorage.setItem(storageKey(scope), JSON.stringify(next));
      } catch {
        // Idem: sem storage, a lista vale só para esta sessão.
      }
      return next;
    });
  }, [scope]);

  return { recent, remember };
}
