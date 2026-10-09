// O uso recomendado que o SITE PÚBLICO da Husqvarna escreve para a máquina (2026-10-09). O servidor só devolve o que conhece
// (`backend/src/utils/husqvarna-public-specs.ts`); aqui vira linha de característica do orçamento, que o atendente marca ou desmarca.

export interface PublicMachineUse {
  useClass: string | null;
  barMinCm: number | null;
  barMaxCm: number | null;
}

const cm = (value: number) => String(value).replace('.', ',');

/** As linhas que entram na lista de características: a classe de uso e, na motosserra, a faixa de sabre. Sem dado, lista vazia. */
export function publicUseLines(use: PublicMachineUse | null | undefined): string[] {
  // Resposta fora do formato (texto onde devia haver número, número onde devia haver texto) não pode derrubar a tela do orçamento: vira "sem dado".
  if (!use || typeof use !== 'object') return [];
  const lines: string[] = [];
  if (typeof use.useClass === 'string' && use.useClass.trim()) lines.push(use.useClass.trim());
  const { barMinCm: min, barMaxCm: max } = use;
  if (typeof min === 'number' && typeof max === 'number' && Number.isFinite(min) && Number.isFinite(max) && min > 0 && min <= max) {
    lines.push(`Sabres compatíveis: ${min === max ? `${cm(min)} cm` : `${cm(min)} a ${cm(max)} cm`}`);
  }
  return lines;
}

/** Junta as linhas do site às da lista sem repetir (comparação sem caixa nem acento). */
export function mergeBulletLines(publicLines: readonly string[], listLines: readonly string[]): string[] {
  const key = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of [...publicLines, ...listLines]) {
    const k = key(line);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(line);
  }
  return out;
}
