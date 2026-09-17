export type PortalVerificationCandidate = {
  model: string;
  normalizedModel: string;
  status: 'LOCAL_IPL' | 'PORTAL_IPL' | 'UNVERIFIED';
  commercialSignals: number;
};

/**
 * Seleciona apenas lacunas técnicas ainda não verificadas para uma homologação
 * explícita no Portal Husqvarna Brasil. A lista comercial define prioridade,
 * nunca compatibilidade. O limite evita varreduras acidentais do portfólio todo.
 */
export function selectPortalVerificationCandidates<T extends PortalVerificationCandidate>(
  items: T[],
  limit = 8,
): T[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0;
  if (!safeLimit) return [];

  return items
    .filter(item => item.status === 'UNVERIFIED')
    .sort((a, b) => b.commercialSignals - a.commercialSignals || a.normalizedModel.localeCompare(b.normalizedModel))
    .slice(0, safeLimit);
}
