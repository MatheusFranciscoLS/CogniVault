import { replayQuery } from '../lib';
import type { SearchHistoryItem } from '../types';

export type RecentSearch = { query: string; replay: string; label: string | null };

/**
 * As últimas buscas do atendente (o histórico do servidor), sem repetir e sem o texto automático do "Perguntar à
 * IA" ("Analise a peça…"), que não é o que a pessoa digitou. Substitui a antiga tela de Histórico: aparece no campo
 * de busca (ao focar, com o campo vazio) e no estado vazio do Atendimento.
 */
export function recentSearchesFrom(history: SearchHistoryItem[], limit = 8): RecentSearch[] {
  const seen = new Set<string>();
  const recent: RecentSearch[] = [];
  for (const item of history) {
    const query = item.query.trim();
    const key = query.toLocaleLowerCase('pt-BR');
    if (query.length < 2 || query.length > 80 || /^analise a pe[cç]a/i.test(query) || seen.has(key)) continue;
    seen.add(key);
    recent.push({ query, replay: replayQuery(item), label: item.resultLabel });
    if (recent.length === limit) break;
  }
  return recent;
}
