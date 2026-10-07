import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiJson, cleanErpCode } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PartLine from '../parts-v2/PartLine';
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
const TAG = 'rounded-md px-2 py-0.5 text-sm font-semibold';

function BriggsNotes({ notes }: { notes?: BriggsPartNote[] }) {
  // Opcional de propósito, e não por precaução vaga: o cache do IPL guarda a
  // resposta por 30 DIAS, então nos primeiros 30 dias depois deste deploy
  // chegam payloads gravados antes de `notes` existir. Sem esta guarda,
  // `notes.length` em `undefined` quebraria a tela do balcão justamente nos
  // motores mais consultados — que são os que estão em cache.
  if (!notes?.length) return null;

  const ordem = (note: BriggsPartNote) => (note.kind === 'DISCONTINUED' ? 0 : note.kind === 'SEE_REFERENCE' ? 1 : 2);

  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1">
      {[...notes].sort((a, b) => ordem(a) - ordem(b)).map(note => {
        if (note.kind === 'DISCONTINUED') {
          return <span key="d" title="A Briggs não fornece mais esta peça" className={`${TAG} bg-destructive/10 text-destructive`}>fora de linha</span>;
        }
        if (note.kind === 'SEE_REFERENCE') {
          return <span key="s" title="Use a peça desta posição no lugar" className={`${TAG} bg-ok-soft text-ok`}>usar pos. {note.position}</span>;
        }
        if (note.kind === 'CODE_DATE_BEFORE' || note.kind === 'CODE_DATE_AFTER') {
          return (
            <span key={note.kind} title="Code date: a data de fabricação gravada na etiqueta do motor. Confira antes de vender." className={`${TAG} bg-warn-soft text-warn`}>
              motor {note.kind === 'CODE_DATE_BEFORE' ? 'até' : 'a partir de'} {note.codeDate}
            </span>
          );
        }
        if (note.kind === 'KIT_ONLY') {
          return <span key="k" title="Não se vende avulsa" className={`${TAG} bg-secondary text-muted-foreground`}>só em kit</span>;
        }
        return <span key="o" title="Só funciona junto da peça desta posição" className={`${TAG} bg-secondary text-muted-foreground`}>só com pos. {note.position}</span>;
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
    return <section aria-busy="true" className="rounded-xl border border-border bg-card px-5 py-4 text-base text-muted-foreground">Procurando a lista de peças Briggs de {model}…</section>;
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
  const noOrcamento = (codigo: string) => quoteCart.items.find(item => cleanErpCode(item.effectiveCode || item.partNumber) === cleanErpCode(codigo))?.quantity ?? 0;

  return (
    <section aria-label={`Motor Briggs ${result.model}`} className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h3 className="min-w-0 truncate text-lg font-semibold">Motor Briggs · <span translate="no" className="font-code tabular-nums">{result.model}</span></h3>
        {/* Avisa o idioma ANTES do clique. Sem inglês, o atendente abre em
            outra língua de propósito, não por surpresa. */}
        {!result.hasEnglish && principal && <span className={`${TAG} shrink-0 bg-warn-soft text-warn`}>só em {principal.languageLabel}</span>}
      </div>

      {!principal && <p className="px-5 py-4 text-base text-muted-foreground">Sem lista de peças para este modelo. Confira o modelo completo na plaqueta.</p>}

      {principal && (
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <Button asChild variant="outline">
            <a href={principal.url} target="_blank" rel="noreferrer noopener" title={`Abrir a lista de peças oficial em ${principal.languageLabel}`}>
              <FileText className="size-4" aria-hidden="true" />Lista de peças ({principal.languageLabel})<ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </Button>
          {outros.map(manual => (
            <Button key={manual.url} asChild variant="ghost" size="sm">
              <a href={manual.url} target="_blank" rel="noreferrer noopener">{manual.languageLabel}<ExternalLink className="size-3.5" aria-hidden="true" /></a>
            </Button>
          ))}
        </div>
      )}

      {/* Só enquanto está lendo. Se a leitura falhar ou o parser recusar, a
          tela não diz nada: fica só o botão do PDF. Decisão do dono: *"o
          atendente nao precisa saber disso"*. O motivo continua na resposta da
          API, para o painel de Qualidade. */}
      {iplQuery.isLoading && principal && <p aria-busy="true" className="border-t border-border px-5 py-3 text-base text-muted-foreground">Lendo os códigos do PDF oficial…</p>}

      {ipl?.status === 'READ' && (
        <div className="border-t border-border">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-muted px-5 py-3">
            <span className="text-base text-muted-foreground">
              {ipl.parts.length} peças ({ipl.language})
              {cobertura ? <span className="ml-2 text-ok">· {cobertura}</span> : null}
            </span>
            <Input value={filtro} onChange={event => setFiltro(event.target.value)} placeholder="Filtrar por código ou nome" aria-label="Filtrar peças do motor" className="h-10 w-64" />
          </div>
          {precoDegradado ? (
            <p role="status" className="border-b border-warn bg-warn-soft px-5 py-3 text-base text-warn">
              Preços da loja temporariamente indisponíveis. Os códigos continuam disponíveis; confirme o valor antes de fechar.
            </p>
          ) : null}

          <div className="max-h-[70vh] overflow-y-auto">
            {agrupar(visiveis).map(grupo => (
              <div key={grupo.nome}>
                {/* Cabeçalho pregado: em 283 linhas, rolando a lista, o
                    atendente perde de vista de que conjunto é a peça. */}
                <h4 className="sticky top-0 z-10 border-y border-border bg-muted px-5 py-2 text-base font-semibold">
                  {grupo.nome} <span className="font-normal text-muted-foreground">· {grupo.pecas.length}</span>
                </h4>
                <div className="space-y-2 p-3">
                  {grupo.pecas.map(part => (
                    <PartLine
                      key={`${part.position}-${part.partNumber}`}
                      position={part.position}
                      name={part.name}
                      code={part.partNumber}
                      quantity={part.quantity}
                      badges={<BriggsNotes notes={part.notes} />}
                      /* O qualificador diz QUAL das peças iguais é esta: a mola
                         de válvula aparece duas vezes, "-(Intake)" e "-(Exhaust)".
                         Quando virou aviso reconhecido, a etiqueta já diz a mesma
                         coisa em português. */
                      notes={part.qualifier && !part.notes?.length ? <p className="mt-1 text-sm text-muted-foreground">{part.qualifier}</p> : null}
                      priceSlot={<PartPriceTag code={part.partNumber} prices={precos} />}
                      inCart={noOrcamento(part.partNumber)}
                      onCopy={() => copiar(part.partNumber)}
                      onAdd={() => {
                        quoteCart.addItem({
                          partNumber: part.partNumber,
                          manufacturer: 'Briggs & Stratton',
                          name: part.name,
                          model: `Motor Briggs ${ipl.model}`,
                          section: part.section || undefined,
                          position: part.position,
                          quantity: part.quantity || 1,
                        });
                      }}
                      menu={onSearchPart ? [{ label: 'Ver preço e estoque', onSelect: () => onSearchPart(part.partNumber) }] : []}
                    />
                  ))}
                </div>
              </div>
            ))}

            {!visiveis.length && <p className="px-5 py-4 text-base text-muted-foreground">Nada com &quot;{filtro}&quot; nesta lista.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
