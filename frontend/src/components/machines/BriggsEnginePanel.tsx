import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../../lib';
import { Icon } from '../icons/Icon';

type BriggsManual = { language: string; languageLabel: string; url: string };
type BriggsResult = { model: string; partsManuals: BriggsManual[]; hasEnglish: boolean };

/**
 * Lista de peças do motor Briggs, dentro do atendimento.
 *
 * **O retorno aqui é o documento, não a tabela** — e isso é diferença de fonte,
 * não de esforço. A Kawasaki publica a lista de peças estruturada (código,
 * posição, descrição), então o painel dela mostra os códigos na tela. A Briggs
 * publica um PDF de vista explodida, e é ele que abre.
 *
 * É a regra do dono aplicada ao que cada fabricante entrega: *"se você não deu
 * um retorno com o código, pelo menos dê um retorno com a vista explodida para
 * que o atendente verifique manualmente"*.
 *
 * Inglês primeiro, com o resto ao lado — *"SEMPRE VOU DAR PRIORIDADE PRO
 * INGLÊS, mas se não tiver o inglês e outra língua eu tenho que abrir igual
 * para ver o código e ver o preço"*.
 */
export default function BriggsEnginePanel({ model }: { model: string }) {
  const manualsQuery = useQuery({
    queryKey: ['briggs-parts-manuals', model],
    enabled: Boolean(model),
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const data = await apiJson<{ briggs: BriggsResult }>(
        `/api/briggs/parts-manuals?model=${encodeURIComponent(model)}`,
        { timeoutMs: 20_000 },
      );
      return data.briggs;
    },
  });

  if (manualsQuery.isLoading) {
    return (
      <section aria-busy="true" className="rounded-xl border border-ink-200 bg-white px-4 py-4 text-sm font-semibold text-ink-500 dark:border-ink-800 dark:bg-ink-900">
        Procurando a lista de peças Briggs de {model}…
      </section>
    );
  }

  const result = manualsQuery.data;
  if (!result) return null;

  const [principal, ...outros] = result.partsManuals;

  return (
    <section className="overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-2.5 dark:border-ink-800">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="machine" className="h-4 w-4 shrink-0 text-red-700 dark:text-red-300" />
          <span className="truncate text-xs font-black text-ink-700 dark:text-ink-200">
            Motor Briggs · {result.model}
          </span>
        </div>
        {/* Avisa o idioma ANTES do clique. Sem inglês, o atendente abre em
            outra língua de propósito, não por surpresa. */}
        {!result.hasEnglish && principal && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            só em {principal.languageLabel}
          </span>
        )}
      </div>

      {!principal && (
        <div className="px-4 py-3 text-[11px] leading-5 text-ink-500 dark:text-ink-400">
          A Briggs não publica lista de peças para este modelo. Confira a plaqueta do
          motor — o modelo tem que estar completo, com tipo e código.
        </div>
      )}

      {principal && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <a
            href={principal.url}
            target="_blank"
            rel="noreferrer noopener"
            title={`Abrir a lista de peças oficial em ${principal.languageLabel}`}
            className="cv-touch-target inline-flex items-center gap-1.5 rounded border border-red-300 bg-red-100 px-3 text-[11px] font-bold text-red-800 transition hover:bg-red-200 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-900/50"
          >
            📕 Lista de peças ({principal.languageLabel}) ↗
          </a>
          {outros.map(manual => (
            <a
              key={manual.url}
              href={manual.url}
              target="_blank"
              rel="noreferrer noopener"
              className="cv-touch-target inline-flex items-center rounded border border-ink-200 bg-white px-2.5 text-[10px] font-semibold text-ink-600 transition hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-300"
            >
              {manual.languageLabel} ↗
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
