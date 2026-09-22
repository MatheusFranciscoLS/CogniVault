import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiJson } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { Icon } from '../icons/Icon';
import { priceCoverage, useMasterPrices } from './master-part-prices';
import PartPriceTag from './PartPriceTag';

type BriggsManual = { language: string; languageLabel: string; url: string };
type BriggsResult = { model: string; partsManuals: BriggsManual[]; hasEnglish: boolean };

type BriggsPartNote =
  | { kind: 'CODE_DATE_BEFORE'; codeDate: string }
  | { kind: 'CODE_DATE_AFTER'; codeDate: string }
  | { kind: 'DISCONTINUED' }
  | { kind: 'SEE_REFERENCE'; position: string }
  | { kind: 'KIT_ONLY' }
  | { kind: 'ONLY_WITH'; position: string };

type BriggsIplPart = {
  position: string;
  partNumber: string;
  name: string;
  quantity: number | null;
  section: string | null;
  qualifier: string | null;
  notes: BriggsPartNote[];
};

/**
 * Os avisos que decidem se a peça serve, em português e curtos.
 *
 * O IPL da Briggs escreve isto em inglês no meio da linha, e o balcão não lê.
 * O mais importante é o **code date**: a data gravada no motor, que separa duas
 * peças diferentes na mesma posição —
 *
 *     209 SPRING, Governor  590541   motor até 17092700
 *     209 SPRING, Governor  596459   motor a partir de 17092600
 *
 * Sem isso as duas aparecem idênticas e metade das vendas sai errada.
 *
 * "Fora de linha" é vermelho e vem primeiro porque é o único que **impede** a
 * venda: prometer peça que a Briggs não fornece mais é o cliente voltando.
 */
function BriggsNotes({ notes }: { notes: BriggsPartNote[] }) {
  if (!notes.length) return null;

  const ordem = (note: BriggsPartNote) => (note.kind === 'DISCONTINUED' ? 0 : note.kind === 'SEE_REFERENCE' ? 1 : 2);

  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1">
      {[...notes].sort((a, b) => ordem(a) - ordem(b)).map(note => {
        if (note.kind === 'DISCONTINUED') {
          return (
            <span key="d" title="A Briggs não fornece mais esta peça" className="rounded bg-rose-100 px-1.5 text-[10px] font-black uppercase text-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
              fora de linha
            </span>
          );
        }
        if (note.kind === 'SEE_REFERENCE') {
          return (
            <span key="s" title="Use a peça desta posição no lugar" className="rounded bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              usar pos. {note.position}
            </span>
          );
        }
        if (note.kind === 'CODE_DATE_BEFORE' || note.kind === 'CODE_DATE_AFTER') {
          return (
            <span
              key={note.kind}
              title="Code date: a data de fabricação gravada na etiqueta do motor. Confira antes de vender."
              className="rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              motor {note.kind === 'CODE_DATE_BEFORE' ? 'até' : 'a partir de'} {note.codeDate}
            </span>
          );
        }
        if (note.kind === 'KIT_ONLY') {
          return (
            <span key="k" title="Não se vende avulsa" className="rounded bg-ink-100 px-1.5 text-[10px] font-bold text-ink-700 dark:bg-ink-800 dark:text-ink-300">
              só em kit
            </span>
          );
        }
        return (
          <span key="o" title="Só funciona junto da peça desta posição" className="rounded bg-ink-100 px-1.5 text-[10px] font-bold text-ink-700 dark:bg-ink-800 dark:text-ink-300">
            só com pos. {note.position}
          </span>
        );
      })}
    </span>
  );
}

type BriggsIplOutcome =
  | { status: 'READ'; model: string; parts: BriggsIplPart[]; sourceUrl: string; language: string }
  | { status: 'DECLINED'; reason: string; label: string; sourceUrl: string | null }
  | { status: 'NO_MANUAL' };

/**
 * Agrupa por conjunto, preservando a ordem em que o PDF entrega.
 *
 * A Kawasaki já mostra conjuntos; a Briggs vinha como 283 linhas corridas, e o
 * atendente rolava sem saber de que parte do motor era a peça. O dado sempre
 * esteve aqui — `section` chegava na resposta e só virava tooltip.
 *
 * A ordem do PDF é a ordem do catálogo, que é como o balcão pensa. Ordenar por
 * nome misturaria o motor.
 */
function agrupar(parts: BriggsIplPart[]): Array<{ nome: string; pecas: BriggsIplPart[] }> {
  const grupos: Array<{ nome: string; pecas: BriggsIplPart[] }> = [];
  const porNome = new Map<string, BriggsIplPart[]>();

  for (const part of parts) {
    const nome = part.section || 'Sem conjunto identificado';
    let lista = porNome.get(nome);
    if (!lista) {
      lista = [];
      porNome.set(nome, lista);
      grupos.push({ nome, pecas: lista });
    }
    lista.push(part);
  }

  return grupos;
}

/**
 * Motor Briggs no atendimento: a lista de peças oficial **e** os códigos lidos
 * dela, quando o parser tem certeza.
 *
 * A leitura do PDF segue a disciplina do extrator de catálogo, a pedido do
 * dono: *"só aceitar quando o parser tiver certeza, e recusar em vez de
 * chutar"*. Quando recusa, a tela do balcão não diz nada — fica só o link do
 * PDF, e o motivo vai para o painel de Qualidade.
 *
 * Inglês primeiro, com o resto ao lado: *"SEMPRE VOU DAR PRIORIDADE PRO INGLÊS,
 * mas se não tiver o inglês e outra língua eu tenho que abrir igual para ver o
 * código e ver o preço"*.
 */
export default function BriggsEnginePanel({
  model,
  onSearchPart,
}: {
  model: string;
  /** Leva um código para a busca interna, onde há preço e estoque. */
  onSearchPart?: (code: string) => void;
}) {
  const quoteCart = useQuoteCart();
  // 150–280 peças por motor: sem filtro o atendente rola demais.
  const [filtro, setFiltro] = useState('');

  const manualsQuery = useQuery({
    queryKey: ['briggs-parts-manuals', model],
    enabled: Boolean(model),
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const data = await apiJson<{ briggs: BriggsResult }>(
        `/api/briggs/parts-manuals?model=${encodeURIComponent(model)}`,
        { timeoutMs: 20_000 },
      );
      return data.briggs ?? null;
    },
  });

  /**
   * As peças lidas do PDF.
   *
   * Consulta separada de propósito: a primeira leitura baixa 1,5 MB e leva
   * 3–12s. O link do PDF aparece na hora e os códigos chegam depois — o balcão
   * nunca fica esperando para ter alguma coisa na mão. Depois disso é cache.
   */
  const iplQuery = useQuery({
    queryKey: ['briggs-ipl-parts', model],
    enabled: Boolean(model),
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const data = await apiJson<{ briggsIpl: BriggsIplOutcome }>(
        `/api/briggs/ipl-parts?model=${encodeURIComponent(model)}`,
        { timeoutMs: 45_000 },
      );
      return data.briggsIpl ?? { status: 'NO_MANUAL' as const };
    },
  });

  const ipl = iplQuery.data ?? null;
  // O preço é da loja, não do PDF da Briggs: uma chamada para a lista toda.
  // Fica aqui, acima dos returns antecipados, porque `useMasterPrices` é hook.
  const codigos = ipl?.status === 'READ' ? ipl.parts.map(part => part.partNumber) : [];
  const priceQuery = useMasterPrices(codigos);
  const precos = priceQuery.data?.prices;
  const precoDegradado = priceQuery.data?.degraded === true;
  const cobertura = priceCoverage(codigos, precos);

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

  const termo = filtro.trim().toLocaleLowerCase('pt-BR');
  const visiveis = ipl?.status === 'READ'
    ? (termo
      ? ipl.parts.filter(part =>
        part.partNumber.toLocaleLowerCase('pt-BR').includes(termo)
        || part.name.toLocaleLowerCase('pt-BR').includes(termo))
      : ipl.parts)
    : [];

  const copiar = (codigo: string) => {
    void navigator.clipboard.writeText(codigo).then(
      () => toast.success(`Código ${codigo} copiado.`),
      () => toast.error(`Não foi possível copiar. Anote: ${codigo}`),
    );
  };

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
          Sem lista de peças para este modelo. Confira o modelo completo na plaqueta.
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

      {/* Só enquanto está lendo. Se a leitura falhar, este aviso desaparece e
          não é substituído por nada — ver o comentário abaixo. */}
      {iplQuery.isLoading && principal && (
        <div aria-busy="true" className="border-t border-ink-100 px-4 py-2.5 text-[11px] font-semibold text-ink-500 dark:border-ink-800 dark:text-ink-400">
          Lendo os códigos do PDF oficial…
        </div>
      )}

      {/* Quando o parser recusa, a tela do balcão não mostra NADA sobre isso —
          fica só o botão do PDF, como se a leitura nem tivesse sido tentada.
          Decisão do dono: *"o atendente nao precisa saber disso"*. Ele quer a
          peça, não o diagnóstico do parser.

          O motivo continua vindo na resposta da API (status DECLINED com o
          campo de razão), para o painel de Qualidade — que é onde este projeto
          já mostra por que um catálogo caiu na leitura visual. Lá o número
          serve para decidir o que ensinar ao parser; aqui só atrapalharia. */}

      {ipl?.status === 'READ' && (
        <div className="border-t border-ink-100 dark:border-ink-800">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-ink-50/70 px-4 py-2 dark:bg-ink-950/40">
            <span className="text-[10px] font-black uppercase tracking-[.12em] text-ink-500 dark:text-ink-400">
              {ipl.parts.length} peças lidas do PDF ({ipl.language})
              {cobertura ? <span className="ml-2 text-emerald-700 dark:text-emerald-400">· {cobertura}</span> : null}
            </span>
            <input
              value={filtro}
              onChange={event => setFiltro(event.target.value)}
              placeholder="filtrar por código ou nome"
              className="h-8 w-48 rounded border border-ink-200 bg-white px-2 text-[11px] outline-none transition focus:border-red-400 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
            />
          </div>
          {precoDegradado ? (
            <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              Preços da loja temporariamente indisponíveis. Os códigos continuam disponíveis; confirme o valor antes de fechar.
            </div>
          ) : null}

          <div className="max-h-[420px] overflow-y-auto">
            {agrupar(visiveis).map(grupo => (
              <div key={grupo.nome}>
                {/* Cabeçalho pregado: em 283 linhas, rolando a lista, o
                    atendente perde de vista de que conjunto é a peça. */}
                <div className="sticky top-0 z-10 border-y border-ink-100 bg-ink-50 px-4 py-1 text-[10px] font-black uppercase tracking-[.1em] text-ink-500 dark:border-ink-800 dark:bg-ink-950 dark:text-ink-400">
                  {grupo.nome} <span className="font-bold text-ink-400 dark:text-ink-500">· {grupo.pecas.length}</span>
                </div>
                <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {grupo.pecas.map(part => (
              <div key={`${part.position}-${part.partNumber}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                <span className="w-12 shrink-0 font-mono text-[10px] font-bold text-ink-500 dark:text-ink-400">
                  {part.position}
                </span>
                <button
                  type="button"
                  onClick={() => copiar(part.partNumber)}
                  title="Copiar o código"
                  className="shrink-0 font-mono text-sm font-black text-ink-900 hover:underline dark:text-brand-300"
                >
                  {part.partNumber}
                </button>
                <span className="min-w-0 flex-1 truncate text-xs text-ink-700 dark:text-ink-200" title={part.qualifier || undefined}>
                  {part.name}
                  {/* O qualificador diz QUAL das peças iguais é esta: a mola de
                      válvula aparece duas vezes, "-(Intake)" e "-(Exhaust)".
                      Quando ele virou aviso reconhecido, a tarja abaixo já diz
                      a mesma coisa em português, e repetir o inglês só ocuparia
                      a linha. */}
                  {part.qualifier && !part.notes.length ? (
                    <span className="text-ink-500 dark:text-ink-400"> · {part.qualifier}</span>
                  ) : null}
                </span>
                <BriggsNotes notes={part.notes} />
                {part.quantity && part.quantity > 1 ? (
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    leva {part.quantity}
                  </span>
                ) : null}
                <PartPriceTag code={part.partNumber} prices={precos} />
                <div className="flex shrink-0 gap-1.5">
                  {onSearchPart && (
                    <button
                      type="button"
                      onClick={() => onSearchPart(part.partNumber)}
                      className="cv-touch-target rounded border border-ink-200 px-2 text-[10px] font-bold text-ink-600 transition hover:border-brand-300 hover:text-brand-700 dark:border-ink-700 dark:text-ink-300"
                    >
                      consultar interno
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      quoteCart.addItem({
                        partNumber: part.partNumber,
                        manufacturer: 'Briggs & Stratton',
                        name: part.name,
                        model: `Motor Briggs ${ipl.model}`,
                        section: part.section || undefined,
                        position: part.position,
                        quantity: part.quantity || 1,
                      });
                      toast.success(`${part.partNumber} no orçamento.`);
                    }}
                    className="cv-touch-target rounded bg-accent-700 px-2 text-[10px] font-bold text-white transition hover:bg-accent-800"
                  >
                    + orçamento
                  </button>
                </div>
              </div>
            ))}
                </div>
              </div>
            ))}

            {!visiveis.length && (
              <div className="px-4 py-3 text-[11px] text-ink-500 dark:text-ink-400">
                Nada com &quot;{filtro}&quot; nesta lista.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
