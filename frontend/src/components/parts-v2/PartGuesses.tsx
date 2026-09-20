import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../../lib';

type PartGuess = {
  id: string;
  partNumber: string;
  name: string;
  section: string | null;
  position: string | null;
  why: string;
};

/**
 * "O cliente descreveu com as palavras dele e eu não achei pelo texto."
 *
 * Último recurso, e só aparece quando a busca determinística voltou vazia e a
 * máquina é conhecida. O cliente diz *"a peça que segura a lâmina"*; o catálogo
 * escreve `PORCA, Lâmina`.
 *
 * **A IA escolhe de uma lista fechada** — as peças daquela máquina — e o
 * servidor confere que a escolha existe nela. Nenhum código nasce aqui.
 *
 * A posição vem junto porque é ela que fecha o caso: o atendente abre a vista
 * explodida, olha o desenho e confirma em um segundo. Quem decide é ele.
 *
 * Silêncio é resposta: sem cota, sem catálogo ou sem certeza, a lista volta
 * vazia e a tela fica com a vista explodida, que é o que o produto já faz.
 */
export default function PartGuesses({
  model,
  query,
  onOpenPart,
}: {
  model: string;
  query: string;
  onOpenPart: (code: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['part-guess', model, query],
    enabled: Boolean(model) && query.trim().length >= 8,
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const result = await apiJson<{ guesses: PartGuess[] }>(
        `/api/parts/guess?model=${encodeURIComponent(model)}&q=${encodeURIComponent(query)}`,
        { timeoutMs: 20_000 },
      );
      return result.guesses ?? [];
    },
  });

  if (isLoading) {
    return (
      <div aria-busy="true" className="rounded-xl border border-ink-200 bg-white px-4 py-3 text-[11px] font-semibold text-ink-500 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-400">
        Procurando no desenho da {model}…
      </div>
    );
  }

  const guesses = data ?? [];
  if (!guesses.length) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-brand-900/60 dark:bg-ink-900">
      <div className="border-b border-brand-100 bg-brand-50/60 px-4 py-2.5 dark:border-brand-900/40 dark:bg-brand-950/20">
        <span className="text-[10px] font-black uppercase tracking-[.12em] text-brand-700 dark:text-brand-300">
          Pelo desenho da {model}, pode ser
        </span>
      </div>

      <div className="divide-y divide-ink-100 dark:divide-ink-800">
        {guesses.map(guess => (
          <button
            key={guess.id}
            type="button"
            onClick={() => onOpenPart(guess.partNumber)}
            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition hover:bg-ink-50 dark:hover:bg-ink-800/60"
          >
            <span className="shrink-0 font-mono text-sm font-black text-ink-900 dark:text-brand-300">
              {guess.partNumber}
            </span>
            <span className="min-w-[9rem] flex-1 truncate text-xs font-bold text-ink-800 dark:text-ink-100">
              {guess.name}
            </span>
            {guess.position ? (
              <span className="shrink-0 rounded bg-ink-100 px-1.5 font-mono text-[10px] font-bold text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                pos. {guess.position}
              </span>
            ) : null}
            {guess.why ? (
              <span className="w-full text-[11px] leading-4 text-ink-500 dark:text-ink-400">{guess.why}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* A única linha de texto da seção, e ela é instrução, não explicação:
          diz o que fazer com o palpite. Confirmar no desenho é o que separa
          "a IA achou" de "o atendente vendeu". */}
      <div className="border-t border-ink-100 px-4 py-2 text-[11px] text-ink-500 dark:border-ink-800 dark:text-ink-400">
        Confira a posição na vista explodida antes de vender.
      </div>
    </section>
  );
}
