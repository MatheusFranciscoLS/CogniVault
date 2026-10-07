import { useMemo } from 'react';
import type { OfficialVerification } from '../../types';
import { cleanErpCode, classifyPartKind } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { effectivePartNumber, isSupersededForCode, normalizePartCode, VerificationBadge } from '../PartVerificationDialog';
import { recordQuoteUsage } from './quoteUsage';
import PartRow from './PartRow';
import type { SearchResultPart } from './types';

type Props = { part: SearchResultPart; verification?: OfficialVerification; verificationLoading?: boolean; selected?: boolean; opening?: boolean; onSelect: () => void; onOpen: () => void; onCopy: (code: string) => void; onCrossReference: (code: string, name: string) => void };

/** Só "conjunto" e "kit" mudam a venda; o resto da classificação era ruído na linha. */
function classificationTag(kind: string) {
  if (kind === 'ASSEMBLY') return <span className="rounded bg-ok-soft px-1.5 text-sm font-semibold text-ok">Conjunto completo</span>;
  if (kind === 'REPAIR_KIT') return <span className="rounded bg-warn-soft px-1.5 text-sm font-semibold text-warn">Kit de reparo</span>;
  return null;
}

export default function PartResultRow({ part, verification, verificationLoading = false, selected = false, opening = false, onSelect, onOpen, onCopy, onCrossReference }: Props) {
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

  const details = [
    part.model,
    part.pnc ? `PNC ${part.pnc}` : '',
    part.position ? `Pos. ${part.position}` : '',
    part.page ? `Pág. ${part.page}` : '',
    superseded ? `substitui ${originalRawCode}` : '',
  ].filter(Boolean);

  return (
    <PartRow
      code={rawCode}
      name={part.name}
      details={details}
      origin="CATALOG"
      tags={<>{classificationTag(classification.kind)}<VerificationBadge verification={verification} loading={verificationLoading} /></>}
      price={part.price ?? null}
      quantityInCart={inCart?.quantity}
      selected={selected}
      opening={opening}
      onSelect={onSelect}
      onOpen={onOpen}
      onAdd={addToQuote}
      menu={[
        { label: 'Copiar código', onSelect: () => onCopy(rawCode) },
        { label: 'Onde usa esta peça', onSelect: () => onCrossReference(rawCode, part.name) },
        { label: opening ? 'Abrindo…' : 'Ver detalhes', onSelect: onOpen },
      ]}
    />
  );
}
