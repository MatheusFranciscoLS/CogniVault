import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export type ReplacementStep = { from: string; to: string };

/**
 * "A Husqvarna trocou este código": mostra o código NOVO (o último da cadeia, o único que ela aceita no pedido)
 * e deixa à vista o que o atendente digitou, para ele ver que o código dele foi reconhecido. Quando a peça passou
 * por várias trocas, o caminho aparece em uma linha pequena.
 *
 * É a mesma faixa na busca (automática) e na gaveta da peça. `children` é o que o balcão faz com o código novo
 * (preço e "+ Orçamento"): não há "buscar de novo", porque é a MESMA peça.
 */
export default function CodeReplacementBanner({
  asked,
  latest,
  chain = [],
  copied = false,
  onCopy,
  children,
}: {
  asked: string;
  latest: string;
  chain?: ReplacementStep[];
  copied?: boolean;
  onCopy: () => void;
  children?: ReactNode;
}) {
  // Passos do meio: tudo entre o código pedido e o último ("passou por").
  const between = chain.slice(0, -1).map(step => step.to);

  return (
    <section role="alert" aria-label="Código substituído" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn bg-warn-soft p-4">
      <div className="min-w-0">
        <p className="text-base font-semibold text-warn">
          A Husqvarna substituiu o código <span translate="no" className="font-code tabular-nums">{asked}</span>
        </p>
        <p className="flex flex-wrap items-baseline gap-x-2 text-base text-foreground">
          Peça este:
          <span translate="no" className="font-code text-2xl font-semibold tabular-nums">{latest}</span>
        </p>
        {between.length > 0 && (
          <p translate="no" className="mt-0.5 font-code text-sm tabular-nums text-muted-foreground">
            Passou por {between.join(' → ')}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {children}
        <Button variant="outline" onClick={onCopy}>{copied ? 'Copiado' : 'Copiar código novo'}</Button>
      </div>
    </section>
  );
}
