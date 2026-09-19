import { Icon } from '../icons/Icon';
import type { HusqvarnaPortalDocument } from '../parts-v2/types';

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  OM: 'Manual do operador',
  IPL: 'Lista / vista de peças',
};

/**
 * Atalho para os documentos oficiais da máquina.
 *
 * Os links já vêm na mesma resposta da consulta rápida (e do cache do Portal),
 * então mostrar aqui não custa requisição nenhuma. O painel oficial abaixo
 * continua tendo o acervo completo, com data e "mais recente"; esta faixa existe
 * porque no balcão o manual e a vista explodida são o que se abre toda hora, e
 * antes exigiam abrir o painel e trocar de aba.
 *
 * Saiu de dentro de `MachinesWorkspace` quando o painel lateral do atendimento
 * passou a mostrar a mesma máquina: duplicar a faixa deixaria as duas telas
 * divergirem no primeiro ajuste.
 */
export default function OfficialDocumentShortcuts({ documents }: { documents: HusqvarnaPortalDocument[] }) {
  if (!documents.length) return null;

  return (
    <section className="rounded-card border border-ink-200 bg-white p-3 shadow-card dark:border-ink-800 dark:bg-ink-850">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-eyebrow uppercase text-accent-700 dark:text-accent-300">Documentos oficiais</h2>
        <span className="text-[10px] text-ink-500">direto da Husqvarna</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {documents.slice(0, 6).map(document => (
          <a
            key={document.url}
            href={document.url}
            target="_blank"
            rel="noreferrer noopener"
            className="cv-touch-target flex min-w-0 max-w-full items-center gap-2 rounded-card border border-ink-200 bg-ink-50 px-3 text-xs font-semibold text-ink-900 transition hover:border-brand-200 hover:bg-brand-50 dark:border-ink-800 dark:bg-ink-900 dark:text-white dark:hover:border-brand-400/50"
          >
            <Icon name="pdf" className="h-4 w-4 shrink-0 text-accent-700 dark:text-accent-300" />
            <span className="min-w-0">
              <span className="block truncate">{document.title}</span>
              <span className="block truncate text-[10px] font-normal text-ink-500">
                {[
                  DOCUMENT_TYPE_LABEL[document.type] || document.type,
                  document.languages.join(', '),
                  document.fileFormat,
                ].filter(Boolean).join(' · ')}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
