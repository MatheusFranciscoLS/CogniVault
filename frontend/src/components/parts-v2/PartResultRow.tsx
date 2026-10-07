import { useMemo } from 'react';
import type { OfficialVerification } from '../../types';
import { cleanErpCode, classifyPartKind } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { effectivePartNumber, isSupersededForCode, normalizePartCode } from '../PartVerificationDialog';
import { recordQuoteUsage } from './quoteUsage';
import { alsoInLabel } from './group-parts';
import PartRow from './PartRow';
import type { SearchResultPart } from './types';

type Props = {
  part: SearchResultPart;
  /** O mesmo código em outros modelos/PNCs. A linha mostra "também em ..."; nada é perdido. */
  others?: SearchResultPart[];
  verification?: OfficialVerification;
  opening?: boolean;
  onOpen: () => void;
  onCopy: (code: string) => void;
};

/** Só o que muda a venda vira etiqueta. O resto (origem, "não verificado") é ruído na linha. */
function Tag({ tone, children }: { tone: 'ok' | 'warn'; children: string }) {
  return <span className={`rounded px-1.5 text-sm font-semibold ${tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>{children}</span>;
}

export default function PartResultRow({ part, others = [], verification, opening = false, onOpen, onCopy }: Props) {
  const quoteCart = useQuoteCart();
  const superseded = isSupersededForCode(part.partNumber, verification);
  const rawCode = cleanErpCode(effectivePartNumber(part.partNumber, verification));
  const originalRawCode = cleanErpCode(part.partNumber);
  const classification = part.classification ?? classifyPartKind(part.name, part.section, part.notes);
  const inCart = useMemo(() => quoteCart.items.find(item => normalizePartCode(item.partNumber) === normalizePartCode(rawCode) && item.model === part.model), [part.model, quoteCart.items, rawCode]);

  const addToQuote = () => {
    recordQuoteUsage([...quoteCart.items, { partNumber: rawCode, model: part.model }], quoteCart.items.length === 0);
    quoteCart.addItem({ partNumber: rawCode, effectiveCode: rawCode, manufacturer: part.manufacturer, name: part.name, model: part.model, pnc: part.pnc, section: part.section, position: part.position, filename: part.filename, page: part.page, isSuperseded: superseded, originalCode: superseded ? originalRawCode : undefined, notes: part.notes, unitPrice: part.price ?? undefined });
  };

  const alsoIn = alsoInLabel(part.model, others);
  const details = [
    part.model,
    part.pnc ? `PNC ${part.pnc}` : '',
    part.position ? `Pos. ${part.position}` : '',
    part.page ? `Pág. ${part.page}` : '',
    alsoIn ? `também em ${alsoIn}` : '',
  ].filter(Boolean);

  return (
    <PartRow
      code={rawCode}
      name={part.name}
      details={details}
      origin="CATALOG"
      tags={
        <>
          {classification.kind === 'ASSEMBLY' && <Tag tone="ok">Conjunto completo</Tag>}
          {classification.kind === 'REPAIR_KIT' && <Tag tone="warn">Kit de reparo</Tag>}
          {/* "Substituído" só quando o código MUDOU: dizer "substituído" de um código que
              continua o mesmo contradiz o próprio texto da linha. */}
          {superseded && <Tag tone="warn">{`Código atualizado (era ${originalRawCode})`}</Tag>}
          {!superseded && verification?.state === 'REVIEW' && <Tag tone="warn">Conferir código</Tag>}
        </>
      }
      price={part.price ?? null}
      quantityInCart={inCart?.quantity}
      opening={opening}
      onOpen={onOpen}
      onCopy={() => onCopy(rawCode)}
      onAdd={addToQuote}
    />
  );
}
