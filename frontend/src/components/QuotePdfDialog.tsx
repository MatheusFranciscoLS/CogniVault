import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useQuoteCart, type QuoteTextOptions } from '../context/QuoteCartContext';
import { parseInputDate, todayInputValue } from '../lib/machine-quote';
import { QUOTE_DEFAULTS } from '../lib/store-profile';
import { Icon } from './icons/Icon';

/**
 * O PDF que o cliente vai receber, como ele sai, antes de mandar: o mesmo documento do botão "PDF", montado de novo a cada ajuste.
 * Imprimir imprime ESTE documento (antes havia uma folha à parte, com outro visual). Data, assunto e validade valem só para este
 * documento (a mensagem do WhatsApp é outra e sai com a data de hoje); o resto (cliente, pagamento, prazo, observações, desconto) é da gaveta
 * e se vê aqui já aplicado.
 */
export default function QuotePdfDialog({ options, onClose }: { options: QuoteTextOptions; onClose: () => void }) {
  const { createPdfQuote, saveCurrentQuote } = useQuoteCart();
  const ids = useId();
  const [dateText, setDateText] = useState(() => todayInputValue());
  const [reference, setReference] = useState<string>(QUOTE_DEFAULTS.reference);
  const [validityText, setValidityText] = useState(String(QUOTE_DEFAULTS.validityDays));
  const [pdf, setPdf] = useState<{ url: string; blob: Blob } | null>(null);
  const [failed, setFailed] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const quoteDate = parseInputDate(dateText);
  const validity = Number(validityText);
  const validityOk = Number.isInteger(validity) && validity >= 1 && validity <= 365;
  const ready = quoteDate !== null && validityOk;
  // Dependências primitivas: o efeito remonta o PDF só quando algo que o muda mudou.
  const optionsKey = JSON.stringify(options);

  useEffect(() => {
    if (!ready || !quoteDate) return;
    let cancelled = false;
    let created: string | null = null;
    const timer = window.setTimeout(async () => {
      try {
        const doc = await createPdfQuote({ ...(JSON.parse(optionsKey) as QuoteTextOptions), quoteDate, reference, validityDays: validity });
        if (cancelled) return;
        if (!doc) { setFailed(true); return; }
        const blob = doc.output('blob');
        created = URL.createObjectURL(blob);
        setPdf(previous => { if (previous) URL.revokeObjectURL(previous.url); return { url: created as string, blob }; });
        setFailed(false);
      } catch (error) {
        console.error('Falha ao montar a prévia do PDF:', error);
        if (!cancelled) setFailed(true);
      }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // `quoteDate` vem de `dateText`; ele muda junto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dateText, reference, validity, optionsKey, createPdfQuote]);

  useEffect(() => () => { setPdf(previous => { if (previous) URL.revokeObjectURL(previous.url); return null; }); }, []);

  const download = () => {
    if (!pdf) return;
    void saveCurrentQuote(options);
    const link = document.createElement('a');
    link.href = pdf.url;
    link.download = `Orcamento_Vardao_${Date.now()}.pdf`;
    link.click();
    toast.success('PDF gerado com sucesso!');
  };

  const print = () => {
    const frame = frameRef.current?.contentWindow;
    if (!pdf || !frame) return;
    void saveCurrentQuote(options);
    frame.focus();
    frame.print();
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[94dvh] gap-4 overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Orçamento para o cliente</DialogTitle>
          <DialogDescription className="sr-only">Prévia do PDF que o cliente recebe, com data, assunto e validade.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="space-y-4">
            <label className="block space-y-1.5 text-base font-medium" htmlFor={`${ids}-data`}>
              Data do orçamento
              <Input id={`${ids}-data`} type="date" value={dateText} onChange={event => setDateText(event.target.value)} aria-invalid={quoteDate === null} />
            </label>
            <label className="block space-y-1.5 text-base font-medium" htmlFor={`${ids}-ref`}>
              Assunto (Ref.)
              <Input id={`${ids}-ref`} value={reference} maxLength={120} onChange={event => setReference(event.target.value)} />
            </label>
            <label className="block space-y-1.5 text-base font-medium" htmlFor={`${ids}-validade`}>
              Validade (dias)
              <Input id={`${ids}-validade`} type="number" min={1} max={365} value={validityText} onChange={event => setValidityText(event.target.value)} aria-invalid={!validityOk} />
            </label>

            <div className="flex flex-col gap-2 pt-1">
              <Button size="lg" onClick={download} disabled={!pdf}><Icon name="pdf" className="size-4" />Baixar PDF</Button>
              <Button size="lg" variant="outline" onClick={print} disabled={!pdf}><Icon name="printer" className="size-4" />Imprimir</Button>
              <Button variant="ghost" onClick={onClose}>Fechar</Button>
            </div>
          </div>

          <div className="min-h-[60dvh] overflow-hidden rounded-lg border border-border bg-secondary">
            {failed ? (
              <p role="status" className="p-4 text-base text-warn">Não foi possível montar o PDF. Confira a data e a validade.</p>
            ) : pdf ? (
              <iframe ref={frameRef} title="Prévia do PDF do orçamento" src={`${pdf.url}#toolbar=0&navpanes=0`} className="h-[72dvh] w-full" />
            ) : (
              <p role="status" className="p-4 text-base text-muted-foreground">Montando o PDF…</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
