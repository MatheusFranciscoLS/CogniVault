import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, MoreHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiJson, cleanErpCode } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import type { OfficialVerification, PartDetail } from '../../types';
import CodeReplacementBanner from './CodeReplacementBanner';
import { effectivePartNumber, isSupersededForCode, officialPortalLabel, officialPortalUrl } from '../PartVerificationDialog';
import { recordQuoteUsage } from './quoteUsage';
import type { HusqvarnaLivePart, WorkContext } from './types';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

/**
 * Gaveta "Detalhe da peça".
 *
 * O site cuida da VISTA EXPLODIDA e do ORÇAMENTO; a venda acontece no sistema da loja.
 * Por isso a ação principal é COPIAR O CÓDIGO, e a gaveta mostra só o que ajuda a
 * vender: código, preço, onde a peça está na vista explodida, o que levar junto. O que
 * era informação sobre o sistema (confiabilidade, fontes, "onde usa", "também serve em")
 * saiu; o raro (conferir, perguntar à IA) mora no menu "⋯".
 */

type Props = {
  detail: PartDetail;
  verification?: OfficialVerification;
  liveData: HusqvarnaLivePart | null;
  onClose: () => void;
  onCopy: (code: string) => void;
  onOpenPdf: (documentId: string, page: number | null, title: string) => void;
  onOpenRelated: (id: string) => void;
  onVerify: () => void;
  onAskAi: (prompt: string) => void;
  /** Há algo por cima (visualizador de PDF, conferência, IA) que fecha com o Esc: a gaveta fica. */
  escapeBlocked?: boolean;
};

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Botão de copiar com confirmação na própria tela (o aviso some sozinho em 1,6 s). */
function useCopyFlash(onCopy: (code: string) => void) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((code: string) => {
    onCopy(code);
    setCopied(code);
    window.setTimeout(() => setCopied(current => (current === code ? null : current)), 1600);
  }, [onCopy]);
  return { copied, copy };
}

export default function PartDetailDrawer({ detail, verification, liveData, onClose, onCopy, onOpenPdf, onOpenRelated, onVerify, onAskAi, escapeBlocked = false }: Props) {
  const quoteCart = useQuoteCart();
  const [workContext, setWorkContext] = useState<WorkContext | null>(null);
  const { copied, copy } = useCopyFlash(onCopy);

  const superseded = isSupersededForCode(detail.partNumber, verification);
  const effectiveCode = cleanErpCode(effectivePartNumber(detail.partNumber, verification));
  const originalCode = cleanErpCode(detail.partNumber);
  const quoteManufacturer = detail.manufacturer || detail.document.manufacturer || null;
  const officialUrl = liveData?.originalPartUrl || verification?.officialUrl || officialPortalUrl(effectiveCode, quoteManufacturer);
  const inCart = useMemo(() => quoteCart.items.find(item => cleanErpCode(item.partNumber) === effectiveCode && item.model === detail.model), [detail.model, effectiveCode, quoteCart.items]);

  useEffect(() => {
    let active = true;
    void apiJson<{ context: WorkContext }>(`/api/parts/${encodeURIComponent(effectiveCode)}/work-context?model=${encodeURIComponent(detail.model)}`)
      .then(data => { if (active) setWorkContext(data.context); })
      .catch(() => { if (active) setWorkContext(null); });
    return () => { active = false; };
  }, [detail.model, effectiveCode]);

  const addToQuote = () => {
    recordQuoteUsage([...quoteCart.items, { partNumber: effectiveCode, model: detail.model }], quoteCart.items.length === 0);
    quoteCart.addItem({ partNumber: effectiveCode, effectiveCode, manufacturer: quoteManufacturer, name: detail.name, model: detail.model, pnc: detail.pnc, section: detail.section, position: detail.position, filename: detail.filename, page: detail.page, isSuperseded: superseded, originalCode: superseded ? originalCode : undefined, notes: detail.notes, unitPrice: detail.price ?? undefined });
  };

  // "Leve junto": a lista curada (a junta DO carburador) primeiro, e depois o que costuma
  // sair junto nos orçamentos reais, sem repetir. Uma lista só.
  const companions = useMemo(() => {
    const curated = (detail.suggestedAddons?.items ?? []).map(item => ({ key: item.id, id: item.id as string | null, code: cleanErpCode(item.partNumber), title: item.label || item.name }));
    const known = new Set(curated.map(item => item.code));
    const together = workContext?.togetherReady
      ? workContext.frequentlyTogether
          .filter(item => !known.has(cleanErpCode(item.partNumber)) && cleanErpCode(item.partNumber) !== effectiveCode)
          .map(item => ({ key: `t-${item.partNumber}`, id: null as string | null, code: cleanErpCode(item.partNumber), title: item.name }))
      : [];
    return [...curated, ...together].slice(0, 5);
  }, [detail.suggestedAddons, effectiveCode, workContext]);

  const consumables = detail.suggestedAddons?.consumables ?? [];
  const price = detail.price != null ? brl.format(detail.price) : null;
  const shelf = workContext?.location?.value || null;
  const replacedBy = liveData?.replacedBy ? cleanErpCode(liveData.replacedBy) : null;

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side="right" showCloseButton={false} onEscapeKeyDown={event => { if (escapeBlocked) event.preventDefault(); }} className="w-full gap-0 border-border bg-background p-0 sm:max-w-[560px]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-card px-6 py-4">
          <div className="min-w-0">
            <SheetTitle className="truncate text-2xl font-semibold leading-8 text-foreground">{detail.name}</SheetTitle>
            <SheetDescription className="sr-only">Detalhe da peça</SheetDescription>
            <p className="truncate text-base text-muted-foreground">{[detail.model, detail.pnc ? `PNC ${detail.pnc}` : ''].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Mais ações"><MoreHorizontal className="size-5" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuItem asChild className="h-10 text-base"><a href={officialUrl} target="_blank" rel="noreferrer noopener">{officialPortalLabel(effectiveCode, quoteManufacturer)} ↗</a></DropdownMenuItem>
                <DropdownMenuItem onSelect={onVerify} className="h-10 text-base">Registrar conferência</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAskAi(`Analise a peça ${detail.name}, código ${effectiveCode}, aplicada em ${detail.model}.`)} className="h-10 text-base">Perguntar à IA</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar"><X className="size-5" /></Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-6">
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div>
              <div translate="no" className="break-all font-code text-[40px] font-semibold leading-none tracking-wide tabular-nums">{effectiveCode}</div>
              {superseded && <p className="mt-2 text-sm text-muted-foreground">Substitui o código {originalCode}</p>}
            </div>

            {price ? (
              <div className="font-code text-3xl font-bold tabular-nums">{price}</div>
            ) : (
              <p className="text-base text-muted-foreground">Sem preço cadastrado.{' '}
                <a href="https://parceirohusqvarna.com/Product/Index" target="_blank" rel="noreferrer noopener" onClick={() => copy(effectiveCode)} className="font-semibold text-add underline decoration-dotted underline-offset-4">Consultar no Parceiro</a>
              </p>
            )}

            {shelf && <p className="text-base"><span className="text-muted-foreground">Prateleira </span><span translate="no" className="font-code text-lg font-semibold">{shelf}</span></p>}

            <div className="grid gap-2">
              <Button size="lg" onClick={() => copy(effectiveCode)} className="w-full">
                {copied === effectiveCode ? <><Check className="size-5" />Código copiado</> : <><Copy className="size-5" />Copiar código</>}
              </Button>
              <Button size="lg" variant={inCart ? 'added' : 'add'} onClick={addToQuote} className="w-full">
                {inCart ? <><Check className="size-5" />No orçamento · {inCart.quantity}</> : '+ Adicionar ao orçamento'}
              </Button>
            </div>
          </section>

          {replacedBy && (
            <CodeReplacementBanner
              asked={originalCode}
              latest={replacedBy}
              chain={liveData?.replacementChain}
              copied={copied === replacedBy}
              onCopy={() => copy(replacedBy)}
            />
          )}

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-4">
              {liveData?.imageUrl && (
                <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-white p-1.5">
                  <img src={liveData.imageUrl} alt={liveData.name || detail.name} width={96} height={96} className="max-h-full max-w-full object-contain" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-muted-foreground">Vista explodida</h3>
                <p className="text-lg font-semibold">{detail.position ? `Posição ${detail.position}` : 'Posição não informada'}{detail.page ? ` · Página ${detail.page}` : ''}</p>
              </div>
            </div>
            <Button variant="outline" size="lg" className="mt-4 w-full" onClick={() => onOpenPdf(detail.documentId, detail.page, detail.filename)}>Abrir vista explodida</Button>
          </section>

          {(companions.length > 0 || consumables.length > 0) && (
            <section className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-base font-semibold">Leve junto</h3>
              {detail.suggestedAddons?.reason && <p className="mt-0.5 text-sm text-muted-foreground">{detail.suggestedAddons.reason}</p>}
              {companions.length > 0 && (
                <ul className="mt-2 divide-y divide-border">
                  {companions.map(item => (
                    <li key={item.key} className="flex items-center gap-2 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold">{item.title}</div>
                        <div translate="no" className="font-code text-lg tabular-nums text-muted-foreground">{item.code}</div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => copy(item.code)}>{copied === item.code ? 'Copiado' : 'Copiar'}</Button>
                      {item.id && <Button variant="outline" size="sm" onClick={() => onOpenRelated(item.id as string)}>Abrir</Button>}
                    </li>
                  ))}
                </ul>
              )}
              {/* Óleo é botão, e não linha de catálogo, porque a loja não cadastra código de
                  óleo: entra como linha avulsa (SRV-) e o atendente põe o preço. Quando a
                  máquina não dá para classificar, vêm os quatro e ele escolhe: recomendar
                  20W50 num motor 2 tempos estragaria o motor do cliente. */}
              {consumables.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <span className="text-base text-muted-foreground">Óleo</span>
                  {consumables.map(oleo => (
                    <Button
                      key={oleo.code}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        quoteCart.addItem({ partNumber: oleo.code, name: oleo.label, model: detail.model });
                        toast.success(`${oleo.label} no orçamento.`);
                      }}
                    >
                      + {oleo.label}
                    </Button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
