import { apiJson, cleanErpCode } from './lib';

const manufacturerCache = new Map<string, string | null>();

type PartDetailResponse = {
  part?: {
    manufacturer?: string | null;
    document?: { manufacturer?: string | null };
  };
};

type SearchResponse = {
  parts?: Array<{ partNumber?: string; manufacturer?: string | null }>;
};

function cleanManufacturer(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function manufacturerCacheScope(): string {
  try {
    const tenant = localStorage.getItem('cognivault_tenant')?.trim() || 'anonymous';
    const email = localStorage.getItem('cognivault_email')?.trim().toLocaleLowerCase('pt-BR') || 'anonymous';
    return `${tenant}:${email}`;
  } catch {
    return 'anonymous:anonymous';
  }
}

/**
 * Resolve o fabricante por evidência existente antes de mandar a peça para o
 * orçamento. Nunca deduz pela forma do código ou pelo modelo: se a origem não
 * for inequívoca, devolve `null` e o orçamento preserva a incerteza.
 *
 * O cache inclui tenant + usuário. O módulo permanece vivo entre logout/login
 * na mesma aba; sem esse escopo, a resolução de um tenant poderia ser
 * reaproveitada por outro sem nova evidência.
 */
export async function resolveQuoteManufacturer({
  code,
  partId,
  knownManufacturer,
}: {
  code: string;
  partId?: string | null;
  knownManufacturer?: string | null;
}): Promise<string | null> {
  const known = cleanManufacturer(knownManufacturer);
  if (known) return known;

  const normalizedCode = cleanErpCode(code);
  const scope = manufacturerCacheScope();
  const evidenceKey = partId ? `part:${partId}` : `code:${normalizedCode}`;
  const cacheKey = `${scope}:${evidenceKey}`;
  if (manufacturerCache.has(cacheKey)) return manufacturerCache.get(cacheKey) ?? null;

  if (partId) {
    try {
      const data = await apiJson<PartDetailResponse>(`/api/parts/${encodeURIComponent(partId)}`);
      const manufacturer = cleanManufacturer(data.part?.manufacturer)
        || cleanManufacturer(data.part?.document?.manufacturer);
      if (manufacturer) {
        manufacturerCache.set(cacheKey, manufacturer);
        return manufacturer;
      }
    } catch {
      // Histórico/favorito antigo pode apontar para uma peça já indisponível.
      // Nesse caso tentamos somente a evidência exata pelo código abaixo.
    }
  }

  if (!normalizedCode) {
    manufacturerCache.set(cacheKey, null);
    return null;
  }

  try {
    const data = await apiJson<SearchResponse>(
      `/api/search?q=${encodeURIComponent(code)}&typed=${encodeURIComponent(code)}`,
      { timeoutMs: 12_000 },
    );
    const manufacturers = [...new Set(
      (data.parts ?? [])
        .filter(part => cleanErpCode(part.partNumber || '') === normalizedCode)
        .map(part => cleanManufacturer(part.manufacturer))
        .filter((manufacturer): manufacturer is string => Boolean(manufacturer)),
    )];
    const manufacturer = manufacturers.length === 1 ? manufacturers[0] : null;
    manufacturerCache.set(cacheKey, manufacturer);
    return manufacturer;
  } catch {
    // Falha transitória não vira decisão persistida na sessão: uma nova ação
    // pode conseguir recuperar a origem depois que o backend voltar.
    return null;
  }
}
