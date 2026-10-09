import { api } from '../lib';

/**
 * Registro das buscas que não acharam NADA (pedido do dono, 2026-10-09: "pode registrar o texto sem problemas").
 *
 * Manda só o texto digitado, uma vez por texto e por carregamento da página (rodar a mesma busca de novo quando o contexto da máquina muda não
 * conta duas vezes). É tiro e esquecimento: se falhar, o atendimento segue igual, e o servidor agrega e recusa o que parece dado pessoal.
 */
const reported = new Set<string>();

const keyOf = (query: string) => query.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');

export function reportSearchMiss(query: string): void {
  const key = keyOf(query);
  if (key.length < 2 || reported.has(key)) return;
  reported.add(key);
  void api('/api/search/miss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query.trim() }),
    timeoutMs: 8_000,
  }).catch(() => {
    // Estatística é conveniência: sem rede ou com o servidor acordando, só se perde essa contagem.
    reported.delete(key);
  });
}

/** Só para os testes: cada teste começa sem lembrar o que já foi enviado. */
export function resetSearchMissMemory(): void {
  reported.clear();
}
