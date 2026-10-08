import type { ReactNode } from 'react';

/**
 * Moldura única das telas (Catálogos, Orçamentos, Tabela de preços e toda a Administração): mesma largura,
 * mesma margem e o mesmo cabeçalho. Antes cada tela tinha a sua e as abas pareciam feitas em épocas diferentes
 * (a margem esquerda ia de 20 a 46 px e a de Usuários encolhia ao tamanho do conteúdo).
 *
 * `meta` é a contagem ou a data que descreve a lista ("44 orçamentos arquivados"); `action` é a ação principal da tela.
 * Sem subtítulo explicando o que a tela faz: o título já diz.
 */
export default function PageFrame({ title, meta, action, children }: { title: string; meta?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-[1400px] space-y-4">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-3xl font-semibold leading-9 tracking-tight">{title}</h1>
        {(meta || action) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {meta && <p className="text-base text-muted-foreground tabular-nums">{meta}</p>}
            {action}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
