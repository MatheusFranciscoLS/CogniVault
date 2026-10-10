import { describe, expect, it } from 'vitest';
import { BAND_SECTIONS, isAdminSection, sectionFromPath, sectionPath, sectionTitle, SECTION_ROUTE_PATHS } from './section-routes';
import type { Section } from '../types';

const ALL: Section[] = ['parts', 'catalogs', 'quotes', 'repair', 'prices', 'business', 'overview', 'users', 'quality'];

describe('telas em faixa (redesenho)', () => {
  it('só entram telas que existem, sem repetir', () => {
    expect(new Set(BAND_SECTIONS).size).toBe(BAND_SECTIONS.length);
    for (const section of BAND_SECTIONS) expect(ALL).toContain(section);
  });

  it('toda a Administração já está na faixa', () => {
    for (const section of ALL.filter(isAdminSection)) expect(BAND_SECTIONS).toContain(section);
  });
});

describe('endereços das telas', () => {
  it('cada tela tem um endereço próprio e volta para a mesma tela', () => {
    const paths = ALL.map(sectionPath);
    expect(new Set(paths).size).toBe(ALL.length);
    for (const section of ALL) expect(sectionFromPath(sectionPath(section))).toBe(section);
  });

  it('a Administração fica sob /administracao e o resto não', () => {
    for (const section of ALL) {
      expect(sectionPath(section).startsWith('/administracao/')).toBe(isAdminSection(section));
    }
  });

  it('barra no fim e endereço desconhecido', () => {
    expect(sectionFromPath('/atendimento/')).toBe('parts');
    expect(sectionFromPath('/dashboard')).toBeNull();
    expect(sectionFromPath('/administracao')).toBeNull();
    expect(sectionFromPath('/administracao/qualidade/x')).toBeNull();
  });

  it('home e assistant caem no Atendimento', () => {
    expect(sectionPath('home')).toBe('/atendimento');
    expect(sectionPath('assistant')).toBe('/atendimento');
  });

  it('o título da aba do navegador diz onde o atendente está', () => {
    expect(sectionTitle('quality')).toMatch(/^Qualidade · /);
    expect(sectionTitle('parts')).toMatch(/^Atendimento · /);
    expect(sectionTitle('repair')).toMatch(/^Conserto · /);
    expect(sectionPath('repair')).toBe('/conserto');
  });

  it('lista os endereços para as rotas', () => {
    expect(SECTION_ROUTE_PATHS).toHaveLength(ALL.length);
  });
});
