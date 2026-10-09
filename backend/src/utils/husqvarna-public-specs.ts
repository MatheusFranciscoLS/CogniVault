/**
 * O que o SITE PÚBLICO da Husqvarna diz sobre o USO de uma máquina (2026-10-09, dono: "puxar mais informações na hora de fazer o orçamento de
 * máquinas"). A lista de preços já traz cilindrada, potência, tanque e passo da corrente; o que ela não tem e o site escreve é a classe de uso
 * (motosserra e soprador) e a faixa de sabre recomendada. Medido em 76 modelos: roçadeira, giro zero e as outras categorias NÃO têm "uso
 * recomendado" no site, então nada é deduzido por nós: **só entra o que a Husqvarna escreve, com valor conhecido**. Valor que não está na tabela
 * abaixo é descartado, nunca traduzido por palpite.
 */

export interface PublicMachineUse {
  /** Classe de uso em português, ou `null` quando o site não diz ou diz algo que não conhecemos. */
  useClass: string | null;
  /** Faixa de sabre recomendada, em centímetros (motosserra). As duas pontas ou nenhuma. */
  barMinCm: number | null;
  barMaxCm: number | null;
}

// Motosserra (`WEB_ChainsawSubGroup`): o site devolve o valor em inglês.
const CHAINSAW_CLASS: Record<string, string> = {
  'full time professional use chainsaws': 'Uso profissional em tempo integral',
  'part time use chainsaws': 'Uso em tempo parcial',
  'occasional use chainsaws': 'Uso ocasional',
  'arborists tree-care chainsaws': 'Uso em poda e cuidado de árvores (arborista)',
};

// Soprador (`ART_647`, "Classificação de Uso"): o site já escreve em português.
const BLOWER_CLASS: Record<string, string> = {
  'uso residencial ocasional': 'Uso residencial ocasional',
  'uso residencial intensivo': 'Uso residencial intensivo',
  'uso profissional': 'Uso profissional',
};

const key = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

function numeric(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 && number < 1000 ? number : null;
}

/** Lê a resposta crua (`site.articles.byIds[0].specificationValues`). `null` = o site não tem o artigo. Puro: não toca a rede. */
export function parsePublicMachineUse(data: any): PublicMachineUse | null {
  const article = data?.site?.articles?.byIds?.[0];
  if (!article || !Array.isArray(article.specificationValues)) return null;
  const byId = new Map<string, any>();
  for (const item of article.specificationValues) {
    const id = String(item?.id ?? item?.specificationDefinitions?.id ?? '');
    if (id && !byId.has(id)) byId.set(id, item);
  }
  const chainsaw = CHAINSAW_CLASS[key(byId.get('WEB_ChainsawSubGroup')?.formattedValue)];
  const blower = BLOWER_CLASS[key(byId.get('ART_647')?.formattedValue)];
  const min = numeric(byId.get('TD32_1_metric')?.numericValue);
  const max = numeric(byId.get('TD32_2_metric')?.numericValue);
  const range = min !== null && max !== null && min <= max;
  return { useClass: chainsaw ?? blower ?? null, barMinCm: range ? min : null, barMaxCm: range ? max : null };
}

/** "38 a 70 cm" (ou "35 cm" quando as duas pontas são iguais). Sem a faixa, `null`. */
export function formatBarRange(use: Pick<PublicMachineUse, 'barMinCm' | 'barMaxCm'>): string | null {
  const { barMinCm: min, barMaxCm: max } = use;
  if (min === null || max === null) return null;
  const text = (value: number) => String(value).replace('.', ',');
  return min === max ? `${text(min)} cm` : `${text(min)} a ${text(max)} cm`;
}
