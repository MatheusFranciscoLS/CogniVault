import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { HusqvarnaPortalDocument } from '../parts-v2/types';

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  OM: 'Manual',
  IPL: 'Vista de peças',
};

/**
 * Atalho para os documentos oficiais da máquina.
 *
 * Os links já vêm na mesma resposta da consulta rápida (e do cache do Portal),
 * então mostrar aqui não custa requisição nenhuma. No balcão o manual e a vista
 * de peças em PDF são o que se abre toda hora, e antes exigiam trocar de aba.
 *
 * Uma só fileira de botões, sem título nem legenda: o botão já diz o que abre.
 */
export default function OfficialDocumentShortcuts({ documents }: { documents: HusqvarnaPortalDocument[] }) {
  if (!documents.length) return null;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Documentos oficiais">
      {documents.slice(0, 6).map(document => {
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
