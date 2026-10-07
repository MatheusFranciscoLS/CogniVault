import { describe, expect, it } from 'vitest';
import { recentSearchesFrom } from './recent-searches';
import type { SearchHistoryItem } from '../types';

const item = (query: string, extra: Partial<SearchHistoryItem> = {}): SearchHistoryItem => ({
  id: query, query, pnc: null, status: 'FOUND', resultPartId: null, resultLabel: null, resultCode: null,
  resultModel: null, resultPnc: null, sourceFilename: null, createdAt: '2026-10-07T10:00:00Z', ...extra,
} as SearchHistoryItem);

describe('recentSearchesFrom', () => {
  it('mantém a ordem (mais recente primeiro) e não repete a mesma busca', () => {
    const recent = recentSearchesFrom([item('carburador 143RII'), item('vela de ignição'), item('Carburador 143rii'), item('587106701')]);
    expect(recent.map(r => r.query)).toEqual(['carburador 143RII', 'vela de ignição', '587106701']);
  });

  it('descarta o texto automático do "Perguntar à IA", que não foi digitado pelo atendente', () => {
    const recent = recentSearchesFrom([item('Analise a peça FILTRO DE COMBUSTÍVEL, código 503443201, aplicada em 143RII.'), item('filtro')]);
    expect(recent.map(r => r.query)).toEqual(['filtro']);
  });

  it('descarta busca curta demais e texto enorme', () => {
    expect(recentSearchesFrom([item('a'), item('x'.repeat(200)), item('ok')]).map(r => r.query)).toEqual(['ok']);
  });

  it('respeita o limite', () => {
    const muitos = Array.from({ length: 20 }, (_, i) => item(`busca ${i}`));
    expect(recentSearchesFrom(muitos, 5)).toHaveLength(5);
    expect(recentSearchesFrom(muitos)).toHaveLength(8);
  });

  it('refazer a busca leva o PNC junto quando ele não está no texto', () => {
    const [primeiro] = recentSearchesFrom([item('carburador', { pnc: '967332904' })]);
    expect(primeiro.replay).toContain('967332904');
  });
});
