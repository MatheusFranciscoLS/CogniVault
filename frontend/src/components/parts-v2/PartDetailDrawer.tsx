import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cleanErpCode, classifyPartKind } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import type { OfficialVerification, PartDetail } from '../../types';
import {
  effectivePartNumber,
  isSupersededForCode,
  officialPortalLabel,
  officialPortalUrl,
  VerificationBadge,
} from '../PartVerificationDialog';
import type { HusqvarnaLivePart } from './types';

type Props = {
  detail: PartDetail;
  verification?: OfficialVerification;
  verificationLoading?: boolean;
  liveData: HusqvarnaLivePart | null;
  onClose: () => void;
  onCopy: (code: string) => void;
  onOpenPdf: (documentId: string, page: number | null, title: string) => void;
  onOpenRelated: (id: string) => void;
  onToggleFavorite: () => void;
  onVerify: () => void;
  onCrossReference: (code: string, name: string) => void;
  onAskAi: (prompt: string) => void;
};

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      {eyebrow && (
        <div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{eyebrow}</div>
      )}
      <h3 className="mt-0.5 text-sm font-black text-slate-900 dark:text-white">{title}</h3>
      {description && <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[9px] font-black uppercase tracking-[.13em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{value}</div>
    </div>
  );
}

export default function PartDetailDrawer({
  detail,
  verification,
  verificationLoading = false,
  liveData,
  onClose,
  onCopy,
  onOpenPdf,
  onOpenRelated,
  onToggleFavorite,
  onVerify,
  onCrossReference,
  onAskAi,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const quoteCart = useQuoteCart();

  const superseded = isSupersededForCode(detail.partNumber, verification);
  const effectiveCode = effectivePartNumber(detail.partNumber, verification);
  const rawCode = cleanErpCode(effectiveCode);
  const originalCode = cleanErpCode(detail.partNumber);
  const classification = detail.classification ?? classifyPartKind(detail.name, detail.section, detail.notes);

  const inCart = useMemo(
    () => quoteCart.items.find(item => cleanErpCode(item.partNumber) === rawCode),
    [quoteCart.items, rawCode],
  );

  const addCurrentPart = () => {
    quoteCart.addItem({
      partNumber: rawCode,
      effectiveCode: rawCode,
      name: detail.name,
      model: detail.model,
      pnc: detail.pnc,
      section: detail.section,
      position: detail.position,
      filename: detail.filename,
      page: detail.page,
      isSuperseded: superseded,
      originalCode: superseded ? originalCode : undefined,
      notes: detail.notes,
      unitPrice: detail.price ?? undefined,
    });
  };

  const sendWhatsApp = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?tab=parts&code=${encodeURIComponent(rawCode)}`;
    const lines = [
      '*Peça — Vardão Máquinas*',
      '',
      `🔧 *${detail.name}*`,
      `🔢 Código: *${rawCode}*`,
      `🚜 Aplicação: ${detail.model}${detail.pnc ? ` · PNC ${detail.pnc}` : ''}`,
      detail.position ? `📍 Posição: ${detail.position}${detail.page ? ` · pág. ${detail.page}` : ''}` : '',
      '',
      `🔗 ${shareUrl}`,
    ].filter(Boolean);

    window.open(
      `https://api.whatsapp.com/send?text=${encodeURIComponent(lines.join('\n'))}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const addSuggested = (item: NonNullable<PartDetail['suggestedAddons']>['items'][number]) => {
    const code = cleanErpCode(item.partNumber);
    quoteCart.addItem({
      partNumber: code,
      effectiveCode: code,
      name: item.name,
      model: item.model || detail.model,
      pnc: item.pnc,
      section: item.section,
      position: item.position,
      filename: detail.filename,
      page: item.page,
    });
  };

  const addAllSuggested = () => {
    const items = detail.suggestedAddons?.items ?? [];
    if (!items.length) return;

    quoteCart.addItems(items.map(item => {
      const code = cleanErpCode(item.partNumber);
      return {
        partNumber: code,
        effectiveCode: code,
        name: item.name,
        model: item.model || detail.model,
        pnc: item.pnc,
        section: item.section,
        position: item.position,
        filename: detail.filename,
        page: item.page,
      };
    }));

    toast.success(`${items.length} sugestões adicionadas ao orçamento.`);
  };

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="Fechar detalhes"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="part-v2-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-[980px] flex-col bg-[#f7f9fc] shadow-2xl dark:bg-slate-950"
      >
        <header className="flex min-h-[72px] shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[10px] font-black uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-300">
                Detalhe da peça
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-extrabold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {classification.label.replace(/^\[|\]$/g, '')}
              </span>
            </div>
            <h2 id="part-v2-title" className="mt-1 truncate text-lg font-black text-slate-950 dark:text-white">
              {detail.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Fechar <span className="ml-1 text-[10px] font-medium text-slate-400">Esc</span>
          </button>
        </header>

        <div className="cv-scrollbar flex-1 overflow-y-auto">
          <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-5">
              <section className="overflow-hidden rounded-2xl bg-[#0b1d3a] p-5 text-white shadow-[0_16px_40px_rgba(11,29,58,.16)]">
                <div className="text-[10px] font-black uppercase tracking-[.14em] text-blue-200/70">Código da peça</div>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <div className="font-mono text-3xl font-black tracking-[-.04em]">{rawCode}</div>
                  {superseded && (
                    <div className="pb-1 text-xs font-semibold text-blue-200/80">substitui {originalCode}</div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onCopy(rawCode)}
                    className="rounded-xl bg-white px-4 py-2.5 text-xs font-black text-[#0b1d3a] transition hover:bg-blue-50 active:scale-[.98]"
                  >
                    Copiar código
                  </button>

                  <button
                    type="button"
                    onClick={addCurrentPart}
                    className={`rounded-xl px-4 py-2.5 text-xs font-black transition active:scale-[.98] ${
                      inCart
                        ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                        : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                    }`}
                  >
                    {inCart ? `No orçamento (${inCart.quantity})` : '+ Adicionar ao orçamento'}
                  </button>

                  <button
                    type="button"
                    onClick={sendWhatsApp}
                    className="rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-white/15"
                  >
                    WhatsApp
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenPdf(detail.documentId, detail.page, `${detail.model} — ${detail.filename}`)}
                    className="rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-white/15"
                  >
                    Abrir catálogo
                  </button>

                  <button
                    type="button"
                    onClick={() => onCrossReference(rawCode, detail.name)}
                    className="rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-white/15"
                  >
                    Onde usa?
                  </button>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMoreOpen(value => !value)}
                      className="rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-xs font-black text-white transition hover:bg-white/15"
                      aria-expanded={moreOpen}
                    >
                      Mais ···
                    </button>

                    {moreOpen && (
                      <div className="absolute left-0 top-12 z-20 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        <button
                          type="button"
                          onClick={() => {
                            setMoreOpen(false);
                            onAskAi(`Tenho uma dúvida sobre a peça ${detail.name} (código ${rawCode}) do modelo ${detail.model}. Pode me orientar sobre aplicação e compatibilidade?`);
                          }}
                          className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          Perguntar à IA
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMoreOpen(false);
                            onToggleFavorite();
                          }}
                          className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          {detail.favoriteId ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                        </button>
                        <a
                          href={verification?.officialUrl || officialPortalUrl(rawCode, detail.manufacturer)}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-lg px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          {officialPortalLabel(rawCode, detail.manufacturer)} ↗
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {liveData && (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                  <div className="flex gap-4">
                    {liveData.imageUrl && (
                      <div className="grid h-24 w-24 shrink-0 place-items-center rounded-xl border border-emerald-100 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                        <img src={liveData.imageUrl} alt="" className="max-h-full max-w-full object-contain" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-black uppercase tracking-[.14em] text-emerald-700 dark:text-emerald-300">
                        Dados oficiais Husqvarna
                      </div>
                      <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                        {liveData.name || detail.name}
                      </div>
                      {liveData.replacedBy && (
                        <div className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-rose-700 dark:bg-slate-900 dark:text-rose-300">
                          Código substituído por {cleanErpCode(liveData.replacedBy)}
                        </div>
                      )}
                      {liveData.specifications && (
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                          {liveData.specifications.ean && <span>EAN <strong>{liveData.specifications.ean}</strong></span>}
                          {liveData.specifications.netWeight && <span>Peso <strong>{liveData.specifications.netWeight}</strong></span>}
                          {liveData.specifications.grossWeight && <span>Peso bruto <strong>{liveData.specifications.grossWeight}</strong></span>}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <SectionTitle
                    eyebrow="Conferência"
                    title="Verificação oficial"
                    description="Status de conferência do código com a fonte oficial."
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <VerificationBadge verification={verification} loading={verificationLoading} />
                    <button
                      type="button"
                      onClick={onVerify}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-300 hover:text-[#1d4f91] dark:border-slate-700 dark:text-slate-300"
                    >
                      Registrar conferência
                    </button>
                  </div>
                </div>
              </section>

              <section>
                <SectionTitle eyebrow="Informações" title="Dados técnicos" />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <InfoCell label="Modelo" value={detail.model || '—'} />
                  <InfoCell label="PNC" value={detail.pnc || '—'} />
                  <InfoCell label="Seção" value={detail.section || '—'} />
                  <InfoCell label="Posição / página" value={`${detail.position || '—'} · pág. ${detail.page ?? '—'}`} />
                </div>
                {detail.price != null && (
                  <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/30">
                    <div className="text-[9px] font-black uppercase tracking-[.13em] text-blue-500">Preço cadastrado</div>
                    <div className="mt-1 text-xl font-black text-[#123867] dark:text-blue-200">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(detail.price)}
                    </div>
                  </div>
                )}
                {detail.notes && (
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                    {detail.notes}
                  </div>
                )}
              </section>

              {detail.suggestedAddons && detail.suggestedAddons.items.length > 0 && (
                <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/15">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <SectionTitle
                      eyebrow="Venda assistida"
                      title="Sugestões para esta máquina"
                      description={detail.suggestedAddons.reason || 'Itens de manutenção e peças que fazem sentido conferir junto com esta aplicação.'}
                    />
                    <button
                      type="button"
                      onClick={addAllSuggested}
                      className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-amber-300"
                    >
                      + Adicionar todas
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {detail.suggestedAddons.items.map(item => {
                      const code = cleanErpCode(item.partNumber);
                      return (
                        <div key={item.id} className="flex items-center gap-3 rounded-xl border border-amber-200/80 bg-white p-3 dark:border-amber-900/60 dark:bg-slate-900">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-black text-slate-800 dark:text-slate-100">{item.name}</div>
                            <div className="mt-1 font-mono text-xs font-bold text-[#1d4f91] dark:text-blue-300">{code}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => addSuggested(item)}
                            className="rounded-lg border border-amber-300 px-2.5 py-1.5 text-[10px] font-black text-amber-900 transition hover:bg-amber-100 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40"
                          >
                            + Orçar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {detail.compatibility.length > 0 && (
                <section>
                  <SectionTitle
                    eyebrow="Aplicação"
                    title="Onde esta peça é utilizada"
                    description="Modelos e PNCs encontrados para o mesmo código ou substituição."
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.compatibility.map((item, index) => (
                      <span
                        key={`${item.model}-${item.pnc}-${index}`}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      >
                        {item.model} · PNC {item.pnc || '—'}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <SectionTitle eyebrow="Fonte técnica" title={detail.filename} />
                <div className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {detail.document.manufacturer || 'Fabricante não informado'}
                  <br />
                  {detail.document.model || detail.model || 'Modelo não informado'}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenPdf(detail.documentId, detail.page, detail.filename)}
                  className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-[#1d4f91] transition hover:bg-blue-50 dark:border-slate-700 dark:text-blue-300 dark:hover:bg-slate-800"
                >
                  Abrir na página {detail.page ?? 'do catálogo'}
                </button>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <SectionTitle
                  eyebrow="Catálogo"
                  title="Peças da mesma vista"
                  description="Itens próximos na mesma aplicação técnica. Não significa que sejam vendidos juntos."
                />

                <div className="mt-3 space-y-2">
                  {detail.related.map(item => (
                    <div key={item.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                      <button
                        type="button"
                        onClick={() => onOpenRelated(item.id)}
                        className="w-full text-left"
                      >
                        <div className="text-xs font-black text-slate-800 dark:text-slate-100">{item.name}</div>
                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-400">
                          <span className="font-mono font-bold text-[#1d4f91] dark:text-blue-300">{cleanErpCode(item.partNumber)}</span>
                          {item.position && <span>Pos. {item.position}</span>}
                        </div>
                      </button>

                      <div className="mt-2 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => onCopy(cleanErpCode(item.partNumber))}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                          Copiar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const code = cleanErpCode(item.partNumber);
                            quoteCart.addItem({
                              partNumber: code,
                              effectiveCode: code,
                              name: item.name,
                              model: item.model || detail.model,
                              pnc: item.pnc,
                              section: item.section,
                              position: item.position,
                              filename: detail.filename,
                              page: item.page,
                            });
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-[#1d4f91] dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300"
                        >
                          + Orçar
                        </button>
                      </div>
                    </div>
                  ))}

                  {!detail.related.length && (
                    <div className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-400 dark:bg-slate-800/50">
                      Nenhuma peça adicional nesta vista.
                    </div>
                  )}
                </div>
              </section>

              {liveData?.fitsTo && liveData.fitsTo.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <SectionTitle eyebrow="Fonte oficial" title="Aplicações informadas pela Husqvarna" />
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {liveData.fitsTo.slice(0, 18).map(model => (
                      <span key={model} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {model}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
