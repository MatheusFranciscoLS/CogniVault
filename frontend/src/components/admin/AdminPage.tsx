import type { ReactNode } from 'react';

/**
 * Moldura das telas de administração: título e, se houver, a ação principal da tela.
 *
 * Sem subtítulo explicando o que a tela faz: o título já diz. É o mesmo critério das telas do balcão
 * ("o atendente quer a peça e não a explicação"); aqui quem lê é o dono, mas texto que só descreve a tela
 * continua sendo ruído.
 */
export default function AdminPage({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-[1280px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold leading-9">{title}</h1>
        {action}
      </div>
      {children}
    </section>
  );
}
