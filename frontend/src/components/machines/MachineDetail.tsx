import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../../lib';
import OfficialHusqvarnaPanel from '../parts-v2/OfficialHusqvarnaPanel';
import OfficialDocumentShortcuts from './OfficialDocumentShortcuts';
import MaintenanceKitPanel from './MaintenanceKitPanel';
import type { OfficialFallbackResult } from '../parts-v2/types';

export type MachineDetailLoaded = {
  pnc: string;
  name: string;
  meta: string | null;
};

/**
 * A máquina aberta: documentos oficiais, painel do Portal (com a vista
 * explodida) e o kit de manutenção.
 *
 * Extraído de `MachinesWorkspace` quando o atendimento e as máquinas viraram
 * uma tela só. O painel lateral do atendimento e a tela de máquinas mostram
 * exatamente a mesma coisa, e é isso que o dono pediu: *"eu só escrevo em 1
 * lugar e o site me dá todas as opções"*. Duplicar o conteúdo faria as duas
 * telas divergirem no primeiro ajuste — e a que ficasse velha é a que o balcão
 * usa com o cliente esperando.
 *
 * A consulta é `useQuery` com a MESMA chave nos dois lugares, então abrir a
 * máquina pelo painel lateral e depois pela tela de máquinas não paga a
 * chamada externa duas vezes.
 */
export default function MachineDetail({
  pnc,
  contextModel,
  onOpenPnc,
  onOpenPart,
  onOpenSearch,
  onLoaded,
}: {
  pnc: string;
  /** Modelo do atendimento, usado quando o Portal não nomeia a máquina. */
  contextModel?: string;
  onOpenPnc: (pnc: string) => void;
  onOpenPart: (code: string) => void;
  onOpenSearch?: (term: string) => void;
  onLoaded?: (machine: MachineDetailLoaded) => void;
}) {
  const machineQuery = useQuery({
    queryKey: ['official-machine', pnc],
    enabled: Boolean(pnc),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const data = await apiJson<{ result: OfficialFallbackResult }>(
        `/api/official-fallback?q=${encodeURIComponent(pnc)}`,
        { timeoutMs: 25_000 },
      );
      // PNC de máquina e código de peça Husqvarna têm os mesmos 9 dígitos, e o
      // Portal responde para os dois. Sem esta checagem, um código de peça
      // abriria a tela de máquina vazia, sem vista explodida e sem dizer por
      // quê — o atendente concluiria que o sistema não tem aquela máquina.
      if (data.result.status !== 'FOUND' || data.result.kind !== 'PRODUCT_CATALOG') {
        throw new Error(data.result.message || 'A Husqvarna não confirmou este PNC como máquina.');
      }
      return { ...data.result, url: data.result.portalUrl || null } as OfficialFallbackResult;
    },
  });

  const machine = machineQuery.data ?? null;

  useEffect(() => {
    if (!machine || !onLoaded) return;
    onLoaded({
      pnc: machine.pnc || pnc,
      name: machine.name || contextModel || `PNC ${pnc}`,
      meta: machine.categoryName || machine.articleDescription || null,
    });
  }, [machine, onLoaded, pnc, contextModel]);

  // O catálogo interno indexa o modelo sem a marca ("143RII", não
  // "Husqvarna 143R-II"), então o nome oficial entra limpo na busca do kit.
  const kitModel = useMemo(() => {
    const fromMachine = (machine?.name || '').replace(/^husqvarna\s+/i, '').trim();
    return fromMachine || (contextModel || '').trim();
  }, [machine?.name, contextModel]);

  if (machineQuery.isLoading) {
    return (
      <div aria-busy="true" className="rounded-card border border-ink-200 bg-white px-5 py-8 text-center text-sm font-semibold text-ink-500 dark:border-ink-800 dark:bg-ink-900">
        Abrindo as vistas oficiais desta máquina…
      </div>
    );
  }

  if (machineQuery.error) {
    const message = machineQuery.error instanceof Error
      ? machineQuery.error.message
      : 'Não foi possível consultar a Husqvarna.';
    return (
      <div role="alert" className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
        {message}
      </div>
    );
  }

  if (!machine) return null;

  return (
    <div className="space-y-4">
      <OfficialDocumentShortcuts documents={machine.documents ?? []} />
      <OfficialHusqvarnaPanel
        key={machine.pnc || machine.query}
        result={machine}
        autoExpand
        onOpenPnc={onOpenPnc}
        onOpenPart={onOpenPart}
        onOpenSearch={onOpenSearch}
      />
      {kitModel && <MaintenanceKitPanel model={kitModel} pnc={machine.pnc ?? pnc} />}
    </div>
  );
}
