import type { SourceKind } from './types';

type Props = { source: SourceKind; detail?: string; compact?: boolean };

const sourceConfig: Record<SourceKind, { label: string; className: string; title: string }> = {
  CATALOG: { label: 'CATÁLOGO', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300', title: 'Informação encontrada em catálogo técnico processado pelo CogniVault.' },
  PRICE_LIST: { label: 'CADASTRO COMERCIAL', className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300', title: 'Informação comercial salva no banco a partir da lista vigente da empresa. Não confirma posição técnica no catálogo.' },
  OFFICIAL: { label: 'OFICIAL', className: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-300', title: 'Informação confirmada em fonte oficial.' },
  ONLINE: { label: 'ONLINE', className: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300', title: 'Continuação disponível em fonte oficial online, mas sem vínculo técnico local suficiente.' },
  REVIEW: { label: 'REVISAR', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300', title: 'A informação precisa de conferência antes de ser tratada como resposta técnica.' },
};

export default function SourceBadge({ source, detail, compact = false }: Props) {
  const config = sourceConfig[source];
  return <span title={detail ? `${config.title} ${detail}` : config.title} className={`inline-flex items-center rounded-full border font-black tracking-[.08em] ${config.className} ${compact ? 'px-2 py-0.5 text-[8px]' : 'px-2.5 py-1 text-[9px]'}`}>{config.label}</span>;
}
