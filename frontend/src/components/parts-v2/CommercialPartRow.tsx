import { useMemo } from 'react';
import { cleanErpCode } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { recordQuoteUsage } from './quoteUsage';
import PartRow from './PartRow';
import type { CommercialPart } from './types';

type Props = { part: CommercialPart; selected?: boolean; onSelect: () => void; onCopy: (code: string) => void; onOfficial: (part: CommercialPart) => void };

export default function CommercialPartRow({ part, selected = false, onSelect, onCopy, onOfficial }: Props) {
  const quoteCart = useQuoteCart();
  const code = cleanErpCode(part.partNumber);
  const applications = part.applications?.length ? part.applications : part.application ? [part.application] : [];
  const application = applications[0] || part.productCategories[0] || 'Aplicação não informada';
  const inCart = useMemo(() => quoteCart.items.find(item => cleanErpCode(item.partNumber) === code), [code, quoteCart.items]);

  const addToQuote = () => {
    recordQuoteUsage([...quoteCart.items, { partNumber: code, model: application }], quoteCart.items.length === 0);
    quoteCart.addItem({ partNumber: code, effectiveCode: code, name: part.name, model: application, pnc: null, section: part.priceSections[0] || 'Cadastro comercial', position: null, filename: 'Cadastro comercial', page: null, unitPrice: part.price ?? undefined });
  };

  const details = [
    application,
    applications.length > 1 ? `+${applications.length - 1} aplicações` : '',
    part.references[0] ? `Ref. ${part.references[0]}` : '',
  ].filter(Boolean);

  return (
    <PartRow
      code={code}
      name={part.name}
      details={details}
      origin="PRICE_LIST"
      price={part.price}
      priceMissing={
        // Sem login automático: copia o código e abre o Parceiro numa aba nova, já
        // logado do jeito do atendente. Nada fica guardado no servidor.
        <button
          type="button"
          onClick={() => { onCopy(code); window.open('https://parceirohusqvarna.com/Product/Index', '_blank', 'noopener,noreferrer'); }}
          className="text-left text-base font-semibold text-add underline decoration-dotted underline-offset-4 hover:no-underline lg:text-right"
        >
          Consultar no Parceiro
        </button>
      }
      quantityInCart={inCart?.quantity}
      selected={selected}
      onSelect={onSelect}
      onAdd={addToQuote}
      menu={[
        { label: 'Copiar código', onSelect: () => onCopy(code) },
        { label: 'Conferir na Husqvarna', onSelect: () => onOfficial(part) },
      ]}
    />
  );
}
