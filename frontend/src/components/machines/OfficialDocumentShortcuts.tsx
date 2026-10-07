import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { HusqvarnaPortalDocument } from '../parts-v2/types';

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  IPL: 'Vista de peças',
};

/** Manual do operador (`OM`) não é assunto do balcão (dono, 2026-10-07): ficam só as vistas de peças (`IPL`). */
const isCounterDocument = (document: Pick<HusqvarnaPortalDocument, 'type'>): boolean => document.type !== 'OM';

/**
 * Atalho para os documentos oficiais da máquina.
 *
 * Os links já vêm na mesma resposta da consulta rápida (e do cache do Portal),
 * então mostrar aqui não custa requisição nenhuma. No balcão o que se abre é a
 * vista de peças em PDF; o manual do operador não aparece.
 *
 * Uma só fileira de botões, sem título nem legenda: o botão já diz o que abre.
 */
export default function OfficialDocumentShortcuts({ documents }: { documents: HusqvarnaPortalDocument[] }) {
  const shown = documents.filter(isCounterDocument);
  if (!shown.length) return null;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Documentos oficiais">
      {shown.slice(0, 6).map(document => {
        const label = [DOCUMENT_TYPE_LABEL[document.type] || document.type, document.languages.join(', ')].filter(Boolean).join(' · ');
        return (
          <Button key={document.url} asChild variant="outline">
            <a href={document.url} target="_blank" rel="noreferrer noopener" title={document.title}>
              <FileText className="size-4" aria-hidden="true" />
              {label}
            </a>
          </Button>
        );
      })}
    </div>
  );
}
