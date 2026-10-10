import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  title: string;
  /** Contagem ou data que descreve a lista ("44 orçamentos arquivados"). */
  meta?: ReactNode;
  /** A ação principal da tela. */
  action?: ReactNode;
  /** Só no padrão `band`: linha pequena acima do título ("Administração"). */
  crumb?: string;
  /** Só no padrão `band`: o que mora DENTRO da faixa (campos de trabalho, filtros, números grandes). */
  band?: ReactNode;
  /** Só no padrão `band`: abas em pílula sobre a borda de baixo da faixa. */
  tabs?: ReactNode;
  /** `band` é o padrão novo (direção B do redesenho, 2026-10-09); `classic` é a moldura antiga, que as telas ainda não convertidas mantêm. */
  look?: 'classic' | 'band';
  children: ReactNode;
};

/**
 * Moldura única das telas (Catálogos, Orçamentos, Tabela de preços e toda a Administração): mesma largura, mesma margem e o mesmo cabeçalho.
 *
 * `look="band"`: faixa marinho de borda a borda com o título e os campos de trabalho, e o conteúdo SOBE sobre ela. A faixa é baixa de propósito: o PC do
 * balcão tem 768 px de altura. Exige o `main` sem margem (`BAND_SECTIONS` em lib/section-routes.ts). Sem subtítulo explicando o que a tela faz.
 */
export default function PageFrame({ title, meta, action, crumb, band, tabs, look = 'classic', children }: Props) {
  if (look === 'band') {
    return (
      <section className="flex w-full flex-1 flex-col">
        <div className="cv-band">
          <div className="mx-auto w-full max-w-[1400px] px-7 pb-14 pt-3">
            {crumb && <p className="text-sm font-semibold text-band-muted">{crumb}</p>}
            <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight">{title}</h1>
              {(meta || action) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {meta && <p className="text-base text-band-muted tabular-nums">{meta}</p>}
                  {action}
                </div>
              )}
            </div>
            {band && <div className="mt-4">{band}</div>}
          </div>
        </div>
        <div className={cn('mx-auto w-full max-w-[1400px] flex-1 px-7 pb-8', tabs ? '-mt-6' : '-mt-9')}>
          {tabs}
          <div className={cn('space-y-4', tabs && 'mt-5')}>{children}</div>
        </div>
      </section>
    );
  }
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
