import type { Section } from '../types';

// Cada tela tem endereço próprio: o balcão copia o link, volta para ele depois de recarregar e vê na barra do
// navegador onde está (antes tudo era /dashboard?tab=…, inclusive a Administração).
type RoutedSection = Exclude<Section, 'home' | 'assistant'>;

const SECTION_PATHS: Record<RoutedSection, string> = {
  parts: '/atendimento',
  catalogs: '/catalogos',
  quotes: '/orcamentos',
  repair: '/conserto',
  prices: '/tabela-de-precos',
  business: '/administracao/negocio',
  overview: '/administracao/visao-geral',
  users: '/administracao/usuarios',
  quality: '/administracao/qualidade',
};

const SECTION_TITLES: Record<RoutedSection, string> = {
  parts: 'Atendimento',
  catalogs: 'Catálogos',
  quotes: 'Orçamentos',
  repair: 'Conserto',
  prices: 'Tabela de preços',
  business: 'Negócio',
  overview: 'Visão geral',
  users: 'Usuários',
  quality: 'Qualidade',
};

export const ADMIN_SECTIONS: readonly Section[] = ['business', 'overview', 'users', 'quality'];

/**
 * Telas já no padrão de faixa do redesenho (direção B, 2026-10-09): o conteúdo vai de borda a borda e a própria tela (`PageFrame look="band"`) cuida da largura.
 * Entram UMA POR PR, na ordem do plano; as que não estão aqui seguem na moldura antiga.
 */
export const BAND_SECTIONS: readonly Section[] = ['business', 'overview', 'users', 'quality', 'quotes', 'prices', 'repair', 'parts', 'catalogs'];

export const SECTION_ROUTE_PATHS: readonly string[] = Object.values(SECTION_PATHS);

function toRouted(section: Section): RoutedSection {
  return section === 'home' || section === 'assistant' ? 'parts' : section;
}

export function sectionPath(section: Section): string {
  return SECTION_PATHS[toRouted(section)];
}

export function sectionTitle(section: Section): string {
  return `${SECTION_TITLES[toRouted(section)]} · CogniVault — Vardão Máquinas`;
}

export function isAdminSection(section: Section): boolean {
  return ADMIN_SECTIONS.includes(section);
}

/** Tela de um endereço novo; `null` para qualquer outro (inclusive o antigo /dashboard, que usa `?tab=`). */
export function sectionFromPath(pathname: string): Section | null {
  const clean = pathname.replace(/\/+$/, '') || '/';
  for (const [section, path] of Object.entries(SECTION_PATHS) as [RoutedSection, string][]) {
    if (path === clean) return section;
  }
  return null;
}
